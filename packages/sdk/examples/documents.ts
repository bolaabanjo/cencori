/**
 * Documents API examples
 *
 * Run with: CENCORI_API_KEY=csk_... npx tsx examples/documents.ts
 */

import fs from 'node:fs';
import { Cencori } from '../src';

async function main() {
    const cencori = new Cencori();

    const pdfUrl = 'https://www.orimi.com/pdf-test.pdf';

    // 1. Extract — native PDF text (free, no LLM)
    console.log('== extract ==');
    const extracted = await cencori.documents.extract({
        document: { url: pdfUrl },
    });
    console.log(`method: ${extracted.method}`);
    console.log(`pages:  ${extracted.pageCount}`);
    console.log(`chars:  ${extracted.text.length}`);
    if (extracted.cost) console.log(`cost:   $${extracted.cost.cencoriChargeUsd.toFixed(6)}`);
    else console.log('cost:   $0 (native extraction, no LLM call)');

    // 2. Summarize
    console.log('\n== summarize ==');
    const summary = await cencori.documents.summarize({
        document: { url: pdfUrl },
    });
    console.log(summary.summary);

    // 3. Query
    console.log('\n== query ==');
    const answer = await cencori.documents.query({
        document: { url: pdfUrl },
        question: 'What is the main topic of this document?',
    });
    console.log(answer.answer);

    // 4. From a local file
    if (fs.existsSync('sample.pdf')) {
        const buf = fs.readFileSync('sample.pdf');
        const local = await cencori.documents.extract({
            document: { base64: buf.toString('base64'), mimeType: 'application/pdf' },
        });
        console.log(`\n== local file ==\nextracted ${local.text.length} chars via ${local.method}`);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
