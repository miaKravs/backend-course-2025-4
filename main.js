import http from 'http';
import fs from 'fs/promises';
import { Command } from 'commander';
import { XMLBuilder } from 'fast-xml-parser';

const program = new Command();

program
    .requiredOption('-i, --input <path>', 'input file path')
    .requiredOption('-h, --host <host>', 'server host')
    .requiredOption('-p, --port <port>', 'server port');

program.parse(process.argv);
const options = program.opts();

const { input, host, port } = options;

const buildXml = (flowers, showVariety) => {
    const builder = new XMLBuilder({ format: true, ignoreAttributes: false });
    const root = {
        irises: {
            flower: flowers.map(f => {
                // беремо значення з полів "petal.length" та "petal.width"
                const petalLength = Number(f['petal.length']);
                const petalWidth = Number(f['petal.width']);

                const entry = {
                    petal_length: Number.isNaN(petalLength) ? '' : petalLength,
                    petal_width: Number.isNaN(petalWidth) ? '' : petalWidth
                };

                if (showVariety) entry.variety = f.variety ?? '';

                return entry;
            })
        }
    };
    return builder.build(root);
};


const server = http.createServer(async (req, res) => {
    try {
        // Якщо шлях містить тільки "/" або інші — ми все одно парсимо query-параметри
        const data = await fs.readFile(input, 'utf-8');

// Пробуємо як звичайний JSON, а якщо не вийде — як "по одному JSON на рядок"
        let flowers;
        try {
            const parsed = JSON.parse(data);

            if (Array.isArray(parsed)) {
                flowers = parsed;                  // якщо це масив
            } else if (Array.isArray(parsed.flowers)) {
                flowers = parsed.flowers;          // якщо дані лежать у полі flowers
            } else {
                flowers = [];
            }
        } catch (e) {
            // Твій випадок: кожен рядок файлу — окремий JSON-об'єкт
            flowers = data
                .split('\n')                       // розбиваємо файл на рядки
                .map(line => line.trim())          // прибираємо пробіли
                .filter(line => line !== '')       // викидаємо порожні рядки
                .map(line => JSON.parse(line));    // парсимо кожен рядок окремо
        }


        const url = new URL(req.url, `http://${host}:${port}`);
        const params = url.searchParams;

        // Параметри згідно з методичкою (варіант 4)
        const showVariety = params.get('variety') === 'true';
        const minPetalLengthParam = params.get('min_petal_length');
        const minPetalLength = minPetalLengthParam ? parseFloat(minPetalLengthParam) : null;

        let filtered = flowers;
        if (!Array.isArray(filtered)) filtered = [];

        if (minPetalLength !== null && !Number.isNaN(minPetalLength)) {
            filtered = filtered.filter(f => {
                const len = Number(f['petal.length']);
                return !Number.isNaN(len) && len > minPetalLength;
            });
        }


        // Формуємо XML
        const xmlData = buildXml(filtered, showVariety);

        res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
        res.end(xmlData);
    } catch (err) {
        // Якщо файл не знайдено — повернути повідомлення згідно з вимогою
        if (err.code === 'ENOENT') {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Cannot find input file');
            console.error('Cannot find input file:', input);
        } else {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Cannot read or parse input file');
            console.error(err);
        }
    }
});

server.listen(Number(port), host, () => {
    console.log(`Server running at http://${host}:${port}/`);
    console.log(`Reading file: ${input}`);
});
