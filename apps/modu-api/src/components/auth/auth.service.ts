import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Member } from '../../libs/dto/member/member';
import { T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';

@Injectable()
export class AuthService {
	constructor(private jwtService: JwtService) {}

	public async hashPassword(memberPassword: string): Promise<string> {
		const salt = await bcrypt.genSalt();
		return await bcrypt.hash(memberPassword, salt);
	}

	public async comparePasswords(password: string, hashedPassword: string): Promise<boolean> {
		return await bcrypt.compare(password, hashedPassword);
	}

	/**
	 * Only identity claims are signed — not the whole document. Counters change on
	 * every like and view, and baking them into the token makes it large and stale.
	 */
	public async createToken(member: Member): Promise<string> {
		const source: T = member['_doc'] ? member['_doc'] : member;
		const payload: T = {
			_id: source._id,
			memberNick: source.memberNick,
			memberType: source.memberType,
			memberStatus: source.memberStatus,
			memberImage: source.memberImage,
		};
		return await this.jwtService.signAsync(payload);
	}

	public async verifyToken(token: string): Promise<Member> {
		const member = await this.jwtService.verifyAsync(token);
		member._id = shapeIntoMongoObjectId(member._id); // string -> ObjectId on the way back in
		return member;
	}
}
