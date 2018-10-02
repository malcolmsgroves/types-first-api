import { race, Observable, BehaviorSubject, NEVER } from 'rxjs'
import * as _ from 'lodash';
import { Metadata } from './interfaces';
import { IError, ErrorCodes } from './errors';
import { filter } from 'rxjs/operators';

export interface ContextOpts {
  metadata?: Metadata;
  deadline?: Date;
}

/*
Context is a container for propagating:
- Cancelation
- Deadlines
- Errors?
*/

const CANCELLATION_ERROR = {
  code: ErrorCodes.Cancelled,
  message: 'Request cancelled by the client.',
  source: 'client',
};

export class Context {
  private data: Record<string, any> = {};
  public metadata: Metadata = {};
  deadline: Date;
  private timer: NodeJS.Timer;
  private _cancel$ = new BehaviorSubject<IError>(null);
  private _parentCancel$: Observable<IError> = NEVER;

  get cancel$() {
    return race(this._cancel$.pipe(filter(v => v != null)), this._parentCancel$);
  }

  private constructor(opts?: ContextOpts) {
    if (opts && opts.deadline) {
      this.deadline = opts.deadline;
      const dt = opts.deadline.getTime() - Date.now();
      if (dt > 0) {
        this.timer = setTimeout(() => {
          this.cancel({
            code: ErrorCodes.Cancelled,
            message: `Request exceeded deadline ${this.deadline.toISOString()}`,
            source: 'client',
          });
        }, dt);
      }
    }

    if (opts && opts.metadata) {
      this.metadata = _.cloneDeep(opts.metadata);
    }
  }

  static create = (opts?: ContextOpts) => {
    return new Context(opts);
  };

  // TODO: chain data, deadline & cancelation
  static from = (parent: Context): Context => {
    const child = new Context({ deadline: parent.deadline });

    child._parentCancel$ = parent.cancel$;

    _.each(parent.get(), (v, k) => {
      child.set(k, v);
    });

    return child;
  };

  set = (k: string, v: any) => {
    this.data[k] = v;
  };

  get(): Record<string, any>;
  get(k: string): any;
  get(k?: string) {
    return k == null ? this.data : this.data[k];
  }

  cancel = (err?: Partial<IError>) => {
    clearTimeout(this.timer);
    const error = { ...CANCELLATION_ERROR, ...err };
    this._cancel$.next(error);
  };
}
