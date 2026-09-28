import { Schema } from 'mongoose';
import { MemberAuthType, MemberStatus, MemberType, socialAuthTypes } from '../libs/enums/member.enum';

function isPasswordAccount(this: { memberAuthType?: MemberAuthType }): boolean {
	return !socialAuthTypes.includes(this.memberAuthType as MemberAuthType);
}

const MemberSchema = new Schema(
	{
		memberType: { type: String, enum: MemberType, default: MemberType.USER },
		memberStatus: { type: String, enum: MemberStatus, default: MemberStatus.ACTIVE },
		memberAuthType: { type: String, enum: MemberAuthType, default: MemberAuthType.PHONE },
		// a social account arrives with neither — it may add both later in My Profile
		memberPhone: { type: String, index: { unique: true, sparse: true }, required: isPasswordAccount },
		memberNick: { type: String, index: { unique: true, sparse: true }, required: true },
		memberPassword: { type: String, select: false, required: isPasswordAccount },
		/** the provider's own user id — Google `sub`, Kakao id, Telegram id */
		memberSocialId: { type: String, select: false },
		memberFullName: { type: String },
		memberImage: { type: String, default: '' },
		memberAddress: { type: String },
		memberDesc: { type: String },

		/** seller storefront fields — only meaningful when memberType is SELLER */
		memberShopName: { type: String },
		memberShopBanner: { type: String },
		memberSocials: { type: [String], default: [] },

		// denormalized counters — one per relationship the UI must display
		memberProducts: { type: Number, default: 0 },
		memberArticles: { type: Number, default: 0 },
		memberFollowers: { type: Number, default: 0 },
		memberFollowings: { type: Number, default: 0 },
		memberPoints: { type: Number, default: 0 },
		memberLikes: { type: Number, default: 0 },
		memberViews: { type: Number, default: 0 },
		memberComments: { type: Number, default: 0 },
		memberOrders: { type: Number, default: 0 },
		memberSales: { type: Number, default: 0 },
		memberRank: { type: Number, default: 0 },
		memberWarnings: { type: Number, default: 0 },
		memberBlocks: { type: Number, default: 0 },

		deletedAt: { type: Date },
	},
	{ timestamps: true, collection: 'members' },
);

// one Modu account per provider identity
MemberSchema.index(
	{ memberAuthType: 1, memberSocialId: 1 },
	{ unique: true, partialFilterExpression: { memberSocialId: { $type: 'string' } } },
);

export default MemberSchema;
