import { registerEnumType } from '@nestjs/graphql';

export enum MemberType {
	USER = 'USER',
	SELLER = 'SELLER',
	ADMIN = 'ADMIN',
}
registerEnumType(MemberType, { name: 'MemberType' });

export enum MemberStatus {
	ACTIVE = 'ACTIVE',
	BLOCK = 'BLOCK',
	DELETE = 'DELETE',
}
registerEnumType(MemberStatus, { name: 'MemberStatus' });

export enum MemberAuthType {
	PHONE = 'PHONE',
	EMAIL = 'EMAIL',
	TELEGRAM = 'TELEGRAM',
	GOOGLE = 'GOOGLE',
	KAKAO = 'KAKAO',
}
registerEnumType(MemberAuthType, { name: 'MemberAuthType' });

/** the auth types that sign in through an outside provider instead of a password */
export const socialAuthTypes = [MemberAuthType.GOOGLE, MemberAuthType.KAKAO, MemberAuthType.TELEGRAM];
