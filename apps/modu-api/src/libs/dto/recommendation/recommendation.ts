import { Field, ObjectType } from '@nestjs/graphql';
import { Product } from '../product/product';

@ObjectType()
export class Recommendations {
	@Field(() => [Product]) list: Product[];

	/** false when the member has no activity yet — the list is then trending / best sellers */
	@Field(() => Boolean) personalized: boolean;
}
