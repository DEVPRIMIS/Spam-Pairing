const fs = require("fs");
const chalk = require("chalk");

const logFile = "logs/pairing_logs.txt";

function monitorLogs() {
    if (!fs.existsSync(logFile)) {
        console.log(chalk.yellow("[!] No logs file found"));
        return;
    }

    const content = fs.readFileSync(logFile, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    
    const successCount = lines.filter(line => line.includes("|") && !line.includes("ERROR")).length;
    const errorCount = lines.filter(line => line.includes("ERROR")).length;

    console.log(chalk.cyan("=".repeat(50)));
    console.log(chalk.green(`📊 Log Summary`));
    console.log(chalk.cyan("=".repeat(50)));
    console.log(chalk.white(`Total entries: ${lines.length}`));
    console.log(chalk.green(`✅ Success: ${successCount}`));
    console.log(chalk.red(`❌ Errors: ${errorCount}`));
    console.log(chalk.cyan("=".repeat(50)));
    
    console.log(chalk.white(`\n📝 Last 10 entries:`));
    lines.slice(-10).forEach(line => {
        if (line.includes("ERROR")) {
            console.log(chalk.red(`  ${line}`));
        } else {
            console.log(chalk.gray(`  ${line}`));
        }
    });
}

if (process.argv.includes("--watch")) {
    console.log(chalk.cyan("[!] Watching logs... (Ctrl+C to stop)"));
    fs.watchFile(logFile, () => {
        console.clear();
        monitorLogs();
    });
} else {
    monitorLogs();
}