import { ObjectId } from 'mongoose';

/** Loose map used for dynamic Mongo `match` / `sort` objects and JWT payloads. */
export interface T {
	[key: string]: any;
}

/** Used by every `<entity>StatsEditor` to $inc a denormalized counter. */
export interface StatisticModifier {
	_id: ObjectId;
	targetKey: string;
	modifier: number;
}
