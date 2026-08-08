import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const label = 'com.cencori.web-postgres';
const postgresHome = process.env.CENCORI_WEB_POSTGRES_HOME || '/opt/homebrew/opt/postgresql@14';
const postgresData = process.env.CENCORI_WEB_POSTGRES_DATA || '/opt/homebrew/var/postgresql@14';
const postgres = path.join(postgresHome, 'bin', 'postgres');
const pgCtl = path.join(postgresHome, 'bin', 'pg_ctl');
const agentsDirectory = path.join(homedir(), 'Library', 'LaunchAgents');
const logsDirectory = path.join(homedir(), 'Library', 'Logs', 'Cencori');
const plistPath = path.join(agentsDirectory, `${label}.plist`);
const launchDomain = `gui/${process.getuid()}`;
const serviceTarget = `${launchDomain}/${label}`;

function xml(value) {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
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
        <string>${xml(postgres)}</string>
        <string>-D</string>
        <string>${xml(postgresData)}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>ExitTimeOut</key>
    <integer>60</integer>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>${xml(path.join(logsDirectory, 'web-postgres.log'))}</string>
    <key>StandardErrorPath</key>
    <string>${xml(path.join(logsDirectory, 'web-postgres.error.log'))}</string>
</dict>
</plist>
`;
}

function command(executable, arguments_, options = {}) {
    return execFileSync(executable, arguments_, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

function bootoutIfLoaded() {
    try {
        command('/bin/launchctl', ['bootout', launchDomain, plistPath]);
    } catch {
        // Expected on first install.
    }
}

function stopUnsupervisedPostgres() {
    try {
        command(pgCtl, ['-D', postgresData, 'stop', '-m', 'fast', '-w', '-t', '60']);
    } catch {
        // The server may already be stopped or owned by the service we removed.
    }
}

async function install() {
    if (!existsSync(postgres)) throw new Error(`PostgreSQL binary not found: ${postgres}`);
    if (!existsSync(postgresData)) throw new Error(`PostgreSQL data directory not found: ${postgresData}`);
    await mkdir(agentsDirectory, { recursive: true });
    await mkdir(logsDirectory, { recursive: true });
    bootoutIfLoaded();
    stopUnsupervisedPostgres();
    const temporaryPath = `${plistPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, plist(), { mode: 0o600 });
    await rename(temporaryPath, plistPath);
    command('/bin/launchctl', ['bootstrap', launchDomain, plistPath]);
    command('/bin/launchctl', ['kickstart', '-k', serviceTarget]);
    process.stdout.write(`Installed and started ${label}\nData: ${postgresData}\n`);
}

async function uninstall() {
    bootoutIfLoaded();
    try {
        await unlink(plistPath);
    } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    process.stdout.write(`Uninstalled ${label}; database files were preserved at ${postgresData}\n`);
}

function status() {
    try {
        process.stdout.write(command('/bin/launchctl', ['print', serviceTarget]));
    } catch {
        process.stderr.write(`${label} is not loaded\n`);
        process.exitCode = 1;
    }
}

const action = process.argv[2];
if (action === 'install') await install();
else if (action === 'uninstall') await uninstall();
else if (action === 'status') status();
else {
    process.stderr.write('Usage: node scripts/web-postgres-service.mjs <install|status|uninstall>\n');
    process.exitCode = 1;
}
