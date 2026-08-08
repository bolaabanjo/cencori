import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const label = 'com.cencori.web-crawler';
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifact = path.join(repository, 'dist-workers', 'web-crawler.mjs');
const nodeExecutable = (() => {
    try {
        return execFileSync('/usr/bin/which', ['node'], { encoding: 'utf8' }).trim() || process.execPath;
    } catch {
        return process.execPath;
    }
})();
const agentsDirectory = path.join(homedir(), 'Library', 'LaunchAgents');
const logsDirectory = path.join(homedir(), 'Library', 'Logs', 'Cencori');
const plistPath = path.join(agentsDirectory, `${label}.plist`);
const launchDomain = `gui/${process.getuid()}`;
const serviceTarget = `${launchDomain}/${label}`;

function xml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function plist() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${xml(nodeExecutable)}</string>
        <string>${xml(artifact)}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${xml(repository)}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>ExitTimeOut</key>
    <integer>180</integer>
    <key>ProcessType</key>
    <string>Background</string>
    <key>LowPriorityIO</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${xml(path.join(logsDirectory, 'web-crawler.log'))}</string>
    <key>StandardErrorPath</key>
    <string>${xml(path.join(logsDirectory, 'web-crawler.error.log'))}</string>
</dict>
</plist>
`;
}

function launchctl(...arguments_) {
    return execFileSync('/bin/launchctl', arguments_, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function bootoutIfLoaded() {
    try {
        launchctl('bootout', launchDomain, plistPath);
    } catch {
        // A missing service is the expected state on first installation.
    }
}

async function install() {
    if (!existsSync(artifact)) {
        throw new Error(`Worker artifact is missing: run npm run build:web-worker first`);
    }
    await mkdir(agentsDirectory, { recursive: true });
    await mkdir(logsDirectory, { recursive: true });
    const temporaryPath = `${plistPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, plist(), { mode: 0o600 });
    bootoutIfLoaded();
    await rename(temporaryPath, plistPath);
    launchctl('bootstrap', launchDomain, plistPath);
    launchctl('kickstart', '-k', serviceTarget);
    process.stdout.write(`Installed and started ${label}\nLogs: ${logsDirectory}\n`);
}

async function uninstall() {
    bootoutIfLoaded();
    try {
        await unlink(plistPath);
    } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    process.stdout.write(`Uninstalled ${label}\n`);
}

function status() {
    try {
        process.stdout.write(launchctl('print', serviceTarget));
    } catch {
        process.stderr.write(`${label} is not loaded\n`);
        process.exitCode = 1;
    }
}

const command = process.argv[2];
if (command === 'install') await install();
else if (command === 'uninstall') await uninstall();
else if (command === 'status') status();
else {
    process.stderr.write('Usage: node scripts/web-crawler-service.mjs <install|status|uninstall>\n');
    process.exitCode = 1;
}
