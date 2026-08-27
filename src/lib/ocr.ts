import { createWorker } from 'tesseract.js';
import type { Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;
let workerError: Error | null = null;

async function getWorker(): Promise<Worker> {
	if (workerError) throw workerError;
	if (!workerPromise) {
		workerPromise = createWorker('eng', 1, {
			logger: () => {}
		}).catch((e) => {
			workerError = e instanceof Error ? e : new Error(String(e));
			workerPromise = null;
			throw workerError;
		});
	}
	return workerPromise;
}

/** Recognise text in an image given its URL. Runs fully on-device. */
export async function ocrImage(url: string): Promise<string> {
	const worker = await getWorker();
	const resp = await fetch(url);
	if (!resp.ok) throw new Error('Could not load image for OCR');
	const blob = await resp.blob();
	const { data } = await worker.recognize(blob);
	return (data.text ?? '').trim();
}
