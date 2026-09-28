import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class TryOnResult {
	/** data URL of the generated photo — never written to disk, the member's photo stays private */
	@Field(() => String) image: string;

	/** try-ons the member has left in the current hour */
	@Field(() => Int) remaining: number;
}
