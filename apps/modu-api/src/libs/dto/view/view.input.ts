import { ObjectId } from 'mongoose';
import { ViewGroup } from '../../enums/view.enum';

/** Server-side only — views are recorded, never submitted. */
export interface ViewInput {
	memberId: ObjectId;
	viewRefId: ObjectId;
	viewGroup: ViewGroup;
}
