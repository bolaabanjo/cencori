import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const profiles = {
    owned: {
        label: 'com.cencori.web-crawler',
        logName: 'web-crawler',
        environment: { CENCORI_WEB_SEMANTIC_ENABLED: 'true' },
    },
    production: {
        label: 'com.cencori.web-crawler-production',
        logName: 'web-crawler-production',
        environment: { CENCORI_WEB_STORE: 'supabase', CENCORI_WEB_SEMANTIC_ENABLED: 'true' },
    },
};
const command = process.argv[2];
const profileName = process.argv[3] || 'owned';
const workerName = process.argv[4] || 'crawler';
if (!['crawler', 'browser', 'embedding'].includes(workerName)) {
    process.stderr.write(`Unknown worker type: ${workerName}\nWorker types: crawler, browser, embedding\n`);
    process.exit(1);
}
const baseProfile = profiles[profileName];
const profile = baseProfile && workerName !== 'crawler' ? {
    ...baseProfile,
    label: `${baseProfile.label.replace('web-crawler', `web-${workerName}`)}`,
    logName: baseProfile.logName.replace('web-crawler', `web-${workerName}`),
} : baseProfile;
if (!profile) {
    process.stderr.write(`Unknown worker profile: ${profileName}\n`);
    process.stderr.write('Profiles: owned, production\n');
    process.exit(1);
}
const { label } = profile;
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifact = path.join(repository, 'dist-workers', `web-${workerName}.mjs`);
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
    const environmentEntries = Object.entries(profile.environment)
        .map(([key, value]) => `        <key>${xml(key)}</key>\n        <string>${xml(value)}</string>`)
        .join('\n');
    const environmentBlock = environmentEntries
        ? `    <key>EnvironmentVariables</key>\n    <dict>\n${environmentEntries}\n    </dict>\n`
        : '';
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
${environmentBlock}    <key>RunAtLoad</key>
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
    <string>${xml(path.join(logsDirectory, `${profile.logName}.log`))}</string>
    <key>StandardErrorPath</key>
    <string>${xml(path.join(logsDirectory, `${profile.logName}.error.log`))}</string>
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
        throw new Error(`Worker artifact is missing: build the ${workerName} worker first`);
    }
    await mkdir(agentsDirectory, { recursive: true });
    await mkdir(logsDirectory, { recursive: true });
    const temporaryPath = `${plistPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, plist(), { mode: 0o600 });
    bootoutIfLoaded();
    await rename(temporaryPath, plistPath);
    launchctl('bootstrap', launchDomain, plistPath);
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

if (command === 'install') await install();
else if (command === 'uninstall') await uninstall();
else if (command === 'status') status();
else {
    process.stderr.write('Usage: node scripts/web-crawler-service.mjs <install|status|uninstall> [owned|production] [crawler|browser|embedding]\n');
    process.exitCode = 1;
}
