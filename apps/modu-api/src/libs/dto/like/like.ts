import { Field, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { LikeGroup } from '../../enums/like.enum';

@ObjectType()
export class Like {
	@Field(() => String) _id: ObjectId;

	@Field(() => LikeGroup) likeGroup: LikeGroup;

	@Field(() => String) likeRefId: ObjectId;

	@Field(() => String) memberId: ObjectId;

	@Field(() => Date) createdAt: Date;

	@Field(() => Date) updatedAt: Date;
}

/**
 * Zero or one element. The same shape comes out of the `lookupAuthMemberLiked`
 * $lookup, so single-read and list paths produce identical JSON.
 */
@ObjectType()
export class MeLiked {
	@Field(() => String) memberId: ObjectId;

	@Field(() => String) likeRefId: ObjectId;

	@Field(() => Boolean) myFavorite: boolean;
}
