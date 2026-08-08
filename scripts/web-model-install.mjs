import { createHash } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const revision = '751bff37182d3f1213fa05d7196b954e230abad9';
const modelId = 'Xenova/all-MiniLM-L6-v2';
const destination = path.resolve('.cencori-web/models/Xenova/all-MiniLM-L6-v2');
const files = ['config.json', 'special_tokens_map.json', 'tokenizer.json', 'tokenizer_config.json', 'vocab.txt'];
const onnxFile = 'onnx/model_quantized.onnx';
const onnxSha256 = 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1';

async function sha256(file) {
    return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function downloadSmallFile(name) {
    const target = path.join(destination, name);
    if (existsSync(target)) return;
    const response = await fetch(`https://huggingface.co/${modelId}/resolve/${revision}/${name}`);
    if (!response.ok) throw new Error(`Could not download ${name}: HTTP ${response.status}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

async function runCurl(arguments_) {
    await new Promise((resolve, reject) => {
        const child = spawn('curl', arguments_, { stdio: 'inherit' });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`curl exited with status ${code}`)));
    });
}

async function downloadOnnx() {
    const target = path.join(destination, onnxFile);
    if (existsSync(target) && await sha256(target) === onnxSha256) return;
    await mkdir(path.dirname(target), { recursive: true });
    const source = `https://huggingface.co/${modelId}/resolve/${revision}/${onnxFile}`;
    const redirect = await fetch(source, { redirect: 'manual' });
    const location = redirect.headers.get('location');
    if (!location) throw new Error(`Model download did not return a signed URL: HTTP ${redirect.status}`);
    const signed = new URL(location, source);
    const resolver = new Resolver();
    resolver.setServers(['8.8.8.8', '1.1.1.1']);
    const addresses = await resolver.resolve4(signed.hostname);
    if (!addresses[0]) throw new Error(`Could not resolve ${signed.hostname}`);
    const temporary = `${target}.${process.pid}.tmp`;
    try {
        await runCurl(['--fail', '--location', '--retry', '3', '--resolve', `${signed.hostname}:443:${addresses[0]}`, '--output', temporary, signed.toString()]);
        const digest = await sha256(temporary);
        if (digest !== onnxSha256) throw new Error(`Model checksum mismatch: expected ${onnxSha256}, received ${digest}`);
        await rename(temporary, target);
    } finally {
        await unlink(temporary).catch(() => undefined);
    }
}

await mkdir(destination, { recursive: true });
for (const file of files) await downloadSmallFile(file);
await downloadOnnx();
process.stdout.write(`Installed ${modelId}@${revision}\nPath: ${destination}\nSHA-256: ${onnxSha256}\n`);
