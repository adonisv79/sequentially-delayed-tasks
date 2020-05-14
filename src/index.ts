import { EventEmitter } from 'events';

const DEFAULT_MAX_RETRIES = 0;
const DEFAULT_SKIP_ON_FAIL = false;
const DEFAULT_DONT_BREAK_ON_ERROR = false;

interface KeyValuePair<T> {
  [index: string]: T;
}

export enum ErrorTypes {
  TaskNameAlreadyInUse = 'SDTASK_NAME_ALREADY_IN_USE',
  TaskNameNotExists = 'SDTASK_NAME_DOES_NOT_EXIST',
  TaskBusy = 'SDTASK_IS_BUSY',
  TaskMaxRetryReached = 'SDTASK_MAX_RETRY_REACHED',
  TaskNotYetRunning = 'SDTASK_NOT_RUNNING',
}

export enum Events {
  JobStarted = 'job_started',
  JobCompleted = 'job_completed',
  JobFailed = 'job_failed',
  JobTerminated = 'job_terminated',
  TaskStarted = 'task_started',
  TaskCompleted = 'task_completed',
  TaskRetrying = 'task_retrying',
  TaskSkipping = 'task_skipping',
  TaskFailed = 'task_failed',
}

export interface TaskBehavior {
  doNotBreakOnError?: boolean;
  skipItemOnFail?: boolean;
  maxReties?: number;
}

export interface TaskConfiguration {
  function: (data?: KeyValuePair<any>) => Promise<boolean>;
  data?: KeyValuePair<any>;
  delay?: number;
  behavior?: TaskBehavior;
}

export interface JobConfig {
  name: string;
  tasks: TaskConfiguration[];
}

interface Job {
  isBusy: boolean;
  isTerminating: boolean;
  config: JobConfig;
}

interface JobResult {
  processedCount: number;
  skippedCount: number;
  failedCount: number;
  retryCount: number;
  isTerminated: boolean;
}

export default class JobManager extends EventEmitter {
  private jobs: KeyValuePair<Job>;

  private defaults: TaskBehavior;

  constructor(defaults: TaskBehavior = {}) {
    super();
    this.jobs = {};
    this.defaults = defaults;
  }

  addJob(config: JobConfig): void {
    if (this.jobs[config.name]) {
      throw new Error(ErrorTypes.TaskNameAlreadyInUse);
    }
    this.jobs[config.name] = {
      isBusy: false,
      isTerminating: false,
      config,
    };
  }

  private execDelayed(name: string, index: number, task: TaskConfiguration): Promise<boolean> {
    return new Promise((resolve, reject) => {
      setTimeout(async (): Promise<void> => {
        try {
          this.emit(Events.TaskStarted, name, index + 1);
          await task.function(task.data);
          this.emit(Events.TaskCompleted, name, index + 1);
          resolve(true);
        } catch (err) {
          const doNotBreakOnError = (task.behavior || {}).doNotBreakOnError
            || this.defaults.doNotBreakOnError || DEFAULT_DONT_BREAK_ON_ERROR;
          if (doNotBreakOnError) {
            return resolve(false);
          }
          reject(err);
        }
      }, task.delay || 0);
    });
  }

  async execJob(taskName: string): Promise<JobResult> {
    const current = this.jobs[taskName];
    if (!current) {
      throw new Error(ErrorTypes.TaskNameNotExists);
    } else if (current.isBusy) {
      throw new Error(ErrorTypes.TaskBusy);
    }
    current.isTerminating = false;
    const result: JobResult = {
      processedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      retryCount: 0,
      isTerminated: false,
    };
    try {
      current.isBusy = true;
      let retryCount = 0;
      this.emit(Events.JobStarted, current.config.name);
      for (let i = 0; i < current.config.tasks.length; i += 1) {
        if (current.isTerminating) {
          result.isTerminated = true;
          this.emit(Events.JobTerminated, current.config.name, i + 1);
          break;
        }
        try {
          const completed = await this.execDelayed(current.config.name, i, current.config.tasks[i]);
          if (!completed) { // do we need to retry the failed step?
            const skipOnFail = (current.config.tasks[i].behavior || {}).skipItemOnFail
              || this.defaults.skipItemOnFail || DEFAULT_SKIP_ON_FAIL;
            const maxRetries = (current.config.tasks[i].behavior || {}).maxReties
              || this.defaults.maxReties || DEFAULT_MAX_RETRIES;
            if (retryCount < maxRetries) {
              i -= 1;
              retryCount += 1;
              result.retryCount += 1;
              this.emit(Events.TaskRetrying, current.config.name, i + 1, retryCount);
            } else if (!skipOnFail) { // max retry is depleted and can no longer proceed unless skiped.
              result.failedCount += 1;
              throw new Error(ErrorTypes.TaskMaxRetryReached);
            } else {
              // the task is skipped instead
              this.emit(Events.TaskSkipping, current.config.name, i + 1);
              result.skippedCount += 1;
            }
          } else {
            result.processedCount += 1;
            retryCount = 0;
          }
        } catch (err) {
          this.emit(Events.TaskFailed, current.config.name, i + 1, err);
          throw err; // you must rethrow the unhandled error to break this job
        }
      }
      this.emit(Events.JobCompleted, current.config.name, result);
    } catch (err) {
      this.emit(Events.JobFailed, taskName, err);
    } finally {
      current.isBusy = false;
    }
    return result;
  }

  async terminateJob(jobName: string): Promise<void> {
    const current = this.jobs[jobName];
    if (!current) {
      throw new Error(ErrorTypes.TaskNameNotExists);
    } else if (!current.isBusy) {
      throw new Error(ErrorTypes.TaskNotYetRunning);
    }
    current.isTerminating = true;
  }
}
