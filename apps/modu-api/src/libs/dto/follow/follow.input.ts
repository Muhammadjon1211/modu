import { Field, InputType, Int } from '@nestjs/graphql';
import { IsNotEmpty, Min } from 'class-validator';
import { ObjectId } from 'mongoose';

@InputType()
class FollowerSearch {
	@IsNotEmpty()
	@Field(() => String)
	followerId: ObjectId;
}

@InputType()
class FollowingSearch {
	@IsNotEmpty()
	@Field(() => String)
	followingId: ObjectId;
}

@InputType()
export class FollowingsInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsNotEmpty()
	@Field(() => FollowerSearch)
	search: FollowerSearch;
}

@InputType()
export class FollowersInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsNotEmpty()
	@Field(() => FollowingSearch)
	search: FollowingSearch;
}
