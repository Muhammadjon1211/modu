import { ObjectId } from 'mongoose';
import { LikeGroup } from '../../enums/like.enum';

/** Server-side only — likes are never sent as a GraphQL input. */
export interface LikeInput {
	memberId: ObjectId;
	likeRefId: ObjectId;
	likeGroup: LikeGroup;
}
