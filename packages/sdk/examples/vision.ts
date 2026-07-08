/**
 * Vision API examples
 *
 * Run with: CENCORI_API_KEY=csk_... npx tsx examples/vision.ts
 */

import fs from 'node:fs';
import { Cencori } from '../src';

async function main() {
    const cencori = new Cencori();

    // 1. Analyze from a URL with a custom prompt
    const analysis = await cencori.vision.analyze({
        image: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg' },
        prompt: 'Describe this animal and estimate its age.',
    });
    console.log('\n== analyze ==');
    console.log(analysis.analysis);
    console.log('cost:', analysis.cost.cencoriChargeUsd.toFixed(6));

    // 2. Describe (preset prompt)
    const description = await cencori.vision.describe({
        image: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg' },
    });
    console.log('\n== describe ==');
    console.log(description.description);

    // 3. OCR from a local file
    if (fs.existsSync('sample_receipt.png')) {
        const buf = fs.readFileSync('sample_receipt.png');
        const ocr = await cencori.vision.ocr({
            image: { base64: buf.toString('base64'), mimeType: 'image/png' },
        });
        console.log('\n== ocr ==');
        console.log(ocr.text);
    }

    // 4. Classify — structured JSON output
    const classified = await cencori.vision.classify({
        image: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg' },
    });
    console.log('\n== classify ==');
    console.log(classified.classification);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
