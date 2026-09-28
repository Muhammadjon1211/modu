import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { readFile } from 'fs/promises';
import { FileUpload } from 'graphql-upload';
import sharp from 'sharp';
import { Product } from '../../libs/dto/product/product';
import { TryOnResult } from '../../libs/dto/try-on/try-on';
import { Message } from '../../libs/enums/common.enum';
import { ProductCategory, ProductStatus } from '../../libs/enums/product.enum';
import {
	TRYON_CATEGORIES,
	TRYON_DENOISE_STEPS,
	TRYON_FN_INDEX,
	TRYON_HOURLY_LIMIT,
	TRYON_SPACE_URL,
	TRYON_TIMEOUT_MS,
	isValidImage,
} from '../../libs/config';

const HOUR_MS = 60 * 60 * 1000;
/** the resolution IDM-VTON works at; anything else is resized by the Space anyway */
const WIDTH = 768;
const HEIGHT = 1024;

interface GradioFile {
	path: string;
	orig_name: string;
	meta: { _type: 'gradio.FileData' };
}

@Injectable()
export class TryOnService {
	/** members with a run in flight — one at a time each */
	private readonly running = new Set<string>();
	/** successful runs per member in the last hour */
	private readonly history = new Map<string, number[]>();

	constructor(@InjectModel('Product') private readonly productModel: Model<Product>) {}

	public isTryOnCategory(category: ProductCategory): boolean {
		return TRYON_CATEGORIES.includes(category);
	}

	public async tryOn(memberId: ObjectId, productId: ObjectId, file: FileUpload): Promise<TryOnResult> {
		const product = await this.productModel
			.findOne({ _id: productId, productStatus: { $ne: ProductStatus.DELETE } })
			.lean()
			.exec();
		if (!product) throw new NotFoundException(Message.NO_DATA_FOUND);
		if (!this.isTryOnCategory(product.productCategory)) throw new BadRequestException(Message.TRYON_NOT_AVAILABLE);

		const key = String(memberId);
		const recent = this.recentRuns(key);
		if (recent.length >= TRYON_HOURLY_LIMIT) throw new BadRequestException(Message.TRYON_LIMIT_REACHED);
		if (this.running.has(key)) throw new BadRequestException(Message.TRYON_BUSY);

		this.running.add(key);
		try {
			const [person, garment] = await Promise.all([
				this.preparePerson(file),
				this.prepareGarment(product.productImages[0]),
			]);
			const output = await this.runSpace(person, garment, product.productTitle);
			const image = await sharp(output).jpeg({ quality: 90 }).toBuffer();

			recent.push(Date.now());
			this.history.set(key, recent);
			return {
				image: `data:image/jpeg;base64,${image.toString('base64')}`,
				remaining: TRYON_HOURLY_LIMIT - recent.length,
			};
		} finally {
			this.running.delete(key);
		}
	}

	private recentRuns(key: string): number[] {
		const since = Date.now() - HOUR_MS;
		return (this.history.get(key) ?? []).filter((time) => time > since);
	}

	/** the member's photo: upright, cropped to the model's 3:4 frame; it only ever lives in memory */
	private async preparePerson(file: FileUpload): Promise<Buffer> {
		const { createReadStream, filename, mimetype } = await file;
		if (!filename || !isValidImage(filename, mimetype)) throw new BadRequestException(Message.PROVIDE_ALLOWED_FORMAT);

		const chunks: Buffer[] = [];
		for await (const chunk of createReadStream()) chunks.push(chunk as Buffer);

		try {
			return await sharp(Buffer.concat(chunks))
				.rotate() // phone photos carry their orientation in EXIF
				.resize(WIDTH, HEIGHT, { fit: 'cover' })
				.jpeg({ quality: 92 })
				.toBuffer();
		} catch {
			throw new BadRequestException(Message.PROVIDE_ALLOWED_FORMAT);
		}
	}

	/** the product's cover photo, letterboxed on white so the garment isn't stretched */
	private async prepareGarment(imagePath: string): Promise<Buffer> {
		const source = await readFile(imagePath).catch(() => {
			throw new NotFoundException(Message.NO_DATA_FOUND);
		});
		return await sharp(source)
			.rotate()
			.resize(WIDTH, HEIGHT, { fit: 'contain', background: '#ffffff' })
			.flatten({ background: '#ffffff' })
			.jpeg({ quality: 92 })
			.toBuffer();
	}

	/**
	 * Gradio queue protocol (sse_v3, Gradio 4.24): upload both images, join the queue,
	 * then read the session's event stream until our job completes.
	 */
	private async runSpace(person: Buffer, garment: Buffer, description: string): Promise<Buffer> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TRYON_TIMEOUT_MS);
		const { signal } = controller;

		try {
			const [human, garm] = await Promise.all([
				this.uploadToSpace(person, 'person.jpg', signal),
				this.uploadToSpace(garment, 'garment.jpg', signal),
			]);

			const sessionHash = Math.random().toString(36).slice(2, 13);
			const join = await fetch(`${TRYON_SPACE_URL}/queue/join`, {
				method: 'POST',
				headers: { ...this.authHeaders(), 'content-type': 'application/json' },
				body: JSON.stringify({
					// dict, garm_img, garment_des, auto-mask, auto-crop, denoise_steps, seed
					data: [
						{ background: human, layers: [], composite: null },
						garm,
						description,
						true,
						false,
						TRYON_DENOISE_STEPS,
						42,
					],
					fn_index: TRYON_FN_INDEX,
					session_hash: sessionHash,
					event_data: null,
					trigger_id: null,
				}),
				signal,
			});
			if (!join.ok) throw new Error(`queue/join ${join.status}: ${await join.text()}`);

			const resultUrl = await this.awaitResult(sessionHash, signal);
			const result = await fetch(resultUrl, { headers: this.authHeaders(), signal });
			if (!result.ok) throw new Error(`result download ${result.status}`);
			return Buffer.from(await result.arrayBuffer());
		} catch (err) {
			if (err instanceof BadRequestException) throw err;
			console.log('Error, TryOnService.runSpace:', signal.aborted ? 'timed out' : err.message);
			throw new BadRequestException(signal.aborted ? Message.TRYON_QUOTA_EXCEEDED : Message.TRYON_FAILED);
		} finally {
			clearTimeout(timer);
		}
	}

	private async uploadToSpace(image: Buffer, name: string, signal: AbortSignal): Promise<GradioFile> {
		const form = new FormData();
		form.append('files', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), name);
		const res = await fetch(`${TRYON_SPACE_URL}/upload`, {
			method: 'POST',
			headers: this.authHeaders(),
			body: form,
			signal,
		});
		if (!res.ok) throw new Error(`upload ${res.status}`);
		const [path] = (await res.json()) as string[];
		return { path, orig_name: name, meta: { _type: 'gradio.FileData' } };
	}

	/** reads server-sent events until the job finishes; returns the generated image's URL */
	private async awaitResult(sessionHash: string, signal: AbortSignal): Promise<string> {
		const res = await fetch(`${TRYON_SPACE_URL}/queue/data?session_hash=${sessionHash}`, {
			headers: this.authHeaders(),
			signal,
		});
		if (!res.ok || !res.body) throw new Error(`queue/data ${res.status}`);

		const decoder = new TextDecoder();
		let buffer = '';
		for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
			buffer += decoder.decode(chunk, { stream: true });
			let end: number;
			while ((end = buffer.indexOf('\n\n')) >= 0) {
				const event = buffer.slice(0, end);
				buffer = buffer.slice(end + 2);
				if (!event.startsWith('data:')) continue;

				const message = JSON.parse(event.slice(5));
				if (message.msg === 'queue_full') throw new BadRequestException(Message.TRYON_QUOTA_EXCEEDED);
				if (message.msg === 'unexpected_error') throw new Error(message.message);
				if (message.msg !== 'process_completed') continue;

				if (!message.success) {
					const error = String(message.output?.error ?? 'unknown error');
					console.log('Error, TryOnService.awaitResult:', error);
					// ZeroGPU reports an exhausted free quota as a failed job
					if (/quota|gpu/i.test(error)) throw new BadRequestException(Message.TRYON_QUOTA_EXCEEDED);
					throw new BadRequestException(Message.TRYON_FAILED);
				}
				const url = message.output?.data?.[0]?.url;
				if (!url) throw new Error('no image in the output');
				return url;
			}
		}
		throw new Error('stream closed before the job finished');
	}

	/** optional: a free Hugging Face token gets a larger GPU quota than anonymous calls */
	private authHeaders(): Record<string, string> {
		const token = process.env.HF_TOKEN;
		return token ? { authorization: `Bearer ${token}` } : {};
	}
}
