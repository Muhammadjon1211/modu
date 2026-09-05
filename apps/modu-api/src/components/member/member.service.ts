import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import moment from 'moment';
import { Member, Members } from '../../libs/dto/member/member';
import { LoginInput, MemberInput, MembersInquiry, SellersInquiry } from '../../libs/dto/member/member.input';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { Follower } from '../../libs/dto/follow/follow';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { Direction, Message } from '../../libs/enums/common.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { StatisticModifier, T } from '../../libs/types/common';
import { AuthService } from '../auth/auth.service';
import { ViewService } from '../view/view.service';
import { LikeService } from '../like/like.service';
import { lookupAuthMemberLiked } from '../../libs/config';

@Injectable()
export class MemberService {
	constructor(
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		@InjectModel('Follow') private readonly followModel: Model<Follower>,
		private readonly authService: AuthService,
		private readonly viewService: ViewService,
		private readonly likeService: LikeService,
	) {}

	public async signup(input: MemberInput): Promise<Member> {
		input.memberPassword = await this.authService.hashPassword(input.memberPassword);
		try {
			const result = await this.memberModel.create(input);
			result.accessToken = await this.authService.createToken(result);
			return result;
		} catch (err) {
			console.log('Error, Service.model:', err.message);
			throw new BadRequestException(Message.USED_MEMBER_NICK_OR_PHONE);
		}
	}

	public async login(input: LoginInput): Promise<Member> {
		const { memberNick, memberPassword } = input;
		const response: Member | null = await this.memberModel
			.findOne({ memberNick })
			.select('+memberPassword')
			.exec();

		if (!response || response.memberStatus === MemberStatus.DELETE)
			throw new NotFoundException(Message.NO_MEMBER_NICK);
		if (response.memberStatus === MemberStatus.BLOCK) throw new ForbiddenException(Message.BLOCKED_USER);

		// select('+memberPassword') guarantees the hash is present on an existing member
		const isMatch = await this.authService.comparePasswords(memberPassword, response.memberPassword ?? '');
		if (!isMatch) throw new UnauthorizedException(Message.WRONG_PASSWORD);

		response.accessToken = await this.authService.createToken(response);
		response.memberPassword = undefined;
		return response;
	}

	public async updateMember(memberId: ObjectId, input: MemberUpdate): Promise<Member> {
		if (input.memberPassword) input.memberPassword = await this.authService.hashPassword(input.memberPassword);

		const result: Member | null = await this.memberModel
			.findOneAndUpdate({ _id: memberId, memberStatus: MemberStatus.ACTIVE }, input, { new: true })
			.exec();
		if (!result) throw new NotFoundException(Message.UPDATE_FAILED);

		// the token carries memberNick / memberType / memberImage, so re-issue it after a change
		result.accessToken = await this.authService.createToken(result);
		return result;
	}

	public async getMember(memberId: ObjectId | null, targetId: ObjectId): Promise<Member> {
		const search: T = { _id: targetId, memberStatus: { $in: [MemberStatus.ACTIVE, MemberStatus.BLOCK] } };
		const targetMember = await this.memberModel.findOne(search).lean<Member>().exec();
		if (!targetMember) throw new NotFoundException(Message.NO_DATA_FOUND);

		if (memberId) {
			const viewInput = { memberId, viewRefId: targetId, viewGroup: ViewGroup.MEMBER };
			const newView = await this.viewService.recordView(viewInput);
			if (newView) {
				await this.memberStatsEditor({ _id: targetId, targetKey: 'memberViews', modifier: 1 });
				targetMember.memberViews++;
			}

			const likeInput = { memberId, likeRefId: targetId, likeGroup: LikeGroup.MEMBER };
			targetMember.meLiked = await this.likeService.checkLikeExistence(likeInput);
			targetMember.meFollowed = await this.checkSubscription(memberId, targetId);
		}
		return targetMember;
	}

	/** one findOne rather than a service round-trip — the reason MemberModule registers Follow */
	private async checkSubscription(followerId: ObjectId, followingId: ObjectId): Promise<any[]> {
		const result = await this.followModel.findOne({ followingId, followerId }).exec();
		return result ? [{ followingId, followerId, myFollowing: true }] : [];
	}

	/** the public seller directory */
	public async getSellers(memberId: ObjectId, input: SellersInquiry): Promise<Members> {
		const { text } = input.search;
		const match: T = { memberType: MemberType.SELLER, memberStatus: MemberStatus.ACTIVE };
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		if (text) match.memberNick = { $regex: new RegExp(text, 'i') };

		const result = await this.memberModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupAuthMemberLiked(memberId),
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] ?? { list: [], metaCounter: [] };
	}

	public async likeTargetMember(memberId: ObjectId, likeRefId: ObjectId): Promise<Member> {
		const target: Member | null = await this.memberModel
			.findOne({ _id: likeRefId, memberStatus: MemberStatus.ACTIVE })
			.exec();
		if (!target) throw new NotFoundException(Message.NO_DATA_FOUND);

		const modifier: number = await this.likeService.toggleLike({
			memberId,
			likeRefId,
			likeGroup: LikeGroup.MEMBER,
		});
		const result = await this.memberStatsEditor({ _id: likeRefId, targetKey: 'memberLikes', modifier });
		if (!result) throw new BadRequestException(Message.SOMETHING_WENT_WRONG);
		return result;
	}

	/** ADMIN **/

	public async getAllMembersByAdmin(input: MembersInquiry): Promise<Members> {
		const { memberStatus, memberType, text } = input.search;
		const match: T = {};
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		if (memberStatus) match.memberStatus = memberStatus;
		if (memberType) match.memberType = memberType;
		if (text) match.memberNick = { $regex: new RegExp(text, 'i') };

		const result = await this.memberModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] ?? { list: [], metaCounter: [] };
	}

	public async updateMemberByAdmin(input: MemberUpdate): Promise<Member> {
		if (input.memberStatus === MemberStatus.DELETE) input.deletedAt = moment().toDate();

		const result: Member | null = await this.memberModel
			.findByIdAndUpdate(input._id, input, { new: true })
			.exec();
		if (!result) throw new NotFoundException(Message.UPDATE_FAILED);
		return result;
	}

	/** The one mutator for every Member counter — always $inc, never read-modify-write. */
	public async memberStatsEditor(input: StatisticModifier): Promise<Member | null> {
		const { _id, targetKey, modifier } = input;
		return await this.memberModel
			.findByIdAndUpdate(_id, { $inc: { [targetKey]: modifier } }, { new: true })
			.exec();
	}
}
