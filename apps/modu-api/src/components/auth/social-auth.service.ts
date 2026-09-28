import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { MemberAuthType } from '../../libs/enums/member.enum';
import { Message } from '../../libs/enums/common.enum';
import { AuthProviders, SocialIdentity } from '../../libs/dto/auth/social';
import { SOCIAL_TELEGRAM_MAX_AGE_SEC, SOCIAL_TIMEOUT_MS } from '../../libs/config';
import { T } from '../../libs/types/common';

/**
 * Turns what a provider handed the browser into a verified identity.
 * Nothing the browser says about the person is believed until checked here:
 * Google's ID token by Google, Kakao's code by exchanging it, Telegram's payload by its HMAC.
 */
@Injectable()
export class SocialAuthService {
	/** Telegram's numeric bot id, read once from getMe — the bot token itself never leaves the server */
	private telegramBotId: string | null = null;

	public async getProviders(): Promise<AuthProviders> {
		return {
			googleClientId: process.env.GOOGLE_CLIENT_ID || undefined,
			kakaoClientId: process.env.KAKAO_REST_API_KEY || undefined,
			telegramBotId: (await this.getTelegramBotId()) ?? undefined,
		};
	}

	public async verify(provider: MemberAuthType, credential: string, redirectUri?: string): Promise<SocialIdentity> {
		try {
			switch (provider) {
				case MemberAuthType.GOOGLE:
					return await this.verifyGoogle(credential);
				case MemberAuthType.KAKAO:
					return await this.verifyKakao(credential, redirectUri);
				case MemberAuthType.TELEGRAM:
					return this.verifyTelegram(credential);
				default:
					throw new BadRequestException(Message.SOCIAL_PROVIDER_DISABLED);
			}
		} catch (err) {
			if (err instanceof BadRequestException) throw err;
			console.log(`Error, SocialAuthService.verify(${provider}):`, err.message);
			throw new BadRequestException(Message.SOCIAL_LOGIN_FAILED);
		}
	}

	/** Google Identity Services ID token — Google checks signature and expiry, we check the audience */
	private async verifyGoogle(idToken: string): Promise<SocialIdentity> {
		const clientId = this.requireEnv('GOOGLE_CLIENT_ID');
		const info = await this.fetchJson(
			`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
		);

		if (info.aud !== clientId) throw new Error('token issued for another client');
		if (!['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) throw new Error('bad issuer');
		if (!info.sub) throw new Error('no subject');

		return { socialId: String(info.sub), name: info.name || info.email?.split('@')[0], image: info.picture };
	}

	/** Kakao authorization code → access token → profile */
	private async verifyKakao(code: string, redirectUri?: string): Promise<SocialIdentity> {
		const clientId = this.requireEnv('KAKAO_REST_API_KEY');
		if (!redirectUri) throw new BadRequestException(Message.BAD_REQUEST);

		const form = new URLSearchParams({
			grant_type: 'authorization_code',
			client_id: clientId,
			redirect_uri: redirectUri,
			code,
		});
		// only needed when "Client Secret" is switched on in Kakao Developers
		if (process.env.KAKAO_CLIENT_SECRET) form.append('client_secret', process.env.KAKAO_CLIENT_SECRET);

		const token = await this.fetchJson('https://kauth.kakao.com/oauth/token', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
			body: form.toString(),
		});
		const user = await this.fetchJson('https://kapi.kakao.com/v2/user/me', {
			headers: { authorization: `Bearer ${token.access_token}` },
		});
		if (!user.id) throw new Error('no user id');

		const profile = user.kakao_account?.profile ?? {};
		return {
			socialId: String(user.id),
			name: profile.nickname ?? user.properties?.nickname,
			image: profile.is_default_image ? undefined : (profile.profile_image_url ?? user.properties?.profile_image),
		};
	}

	/** https://core.telegram.org/widgets/login#checking-authorization */
	private verifyTelegram(credential: string): SocialIdentity {
		const botToken = this.requireEnv('TELEGRAM_BOT_TOKEN');
		const { hash, ...fields }: T = JSON.parse(credential);
		if (!hash || !fields.id || !fields.auth_date) throw new Error('incomplete payload');

		const checkString = Object.keys(fields)
			.filter((key) => fields[key] !== undefined && fields[key] !== null)
			.sort()
			.map((key) => `${key}=${fields[key]}`)
			.join('\n');
		const secret = createHash('sha256').update(botToken).digest();
		const expected = createHmac('sha256', secret).update(checkString).digest();
		const given = Buffer.from(String(hash), 'hex');
		if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error('bad hash');

		// a signed payload never expires on its own — bound it so a leaked one can't be replayed later
		const age = Date.now() / 1000 - Number(fields.auth_date);
		if (age > SOCIAL_TELEGRAM_MAX_AGE_SEC) throw new Error('payload too old');

		const name = [fields.first_name, fields.last_name].filter(Boolean).join(' ');
		return { socialId: String(fields.id), name, nick: fields.username, image: fields.photo_url };
	}

	private async getTelegramBotId(): Promise<string | null> {
		const botToken = process.env.TELEGRAM_BOT_TOKEN;
		if (!botToken) return null;
		if (this.telegramBotId) return this.telegramBotId;
		try {
			const me = await this.fetchJson(`https://api.telegram.org/bot${botToken}/getMe`);
			this.telegramBotId = String(me.result.id);
			return this.telegramBotId;
		} catch (err) {
			console.log('Error, SocialAuthService.getTelegramBotId:', err.message);
			return null;
		}
	}

	private requireEnv(name: string): string {
		const value = process.env[name];
		if (!value) throw new BadRequestException(Message.SOCIAL_PROVIDER_DISABLED);
		return value;
	}

	private async fetchJson(url: string, init: RequestInit = {}): Promise<T> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), SOCIAL_TIMEOUT_MS);
		try {
			const res = await fetch(url, { ...init, signal: controller.signal });
			const body = await res.json().catch(() => ({}));
			// the host only — a Telegram URL carries the bot token in its path
			if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
			return body;
		} finally {
			clearTimeout(timer);
		}
	}
}
