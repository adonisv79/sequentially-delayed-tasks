import TaskManager, { Events } from './index';

let tasks: TaskManager;

function onJobStarted(name: string): void {
  console.log(`Job "${name}" has started.`);
}

function onJobCompleted(name: string): void {
  console.log(`Job "${name}" has completed.`);
}

function onJobFailed(name: string, err: Error): void {
  console.error(`Job "${name}" has failed with error ${err.message}.`);
}

function onjobTerminated(name: string, taskNumber: number): void {
  console.log(`Job "${name}" on task # ${taskNumber} was terminated.`);
}

function onTaskStarted(name: string, taskNumber: number): void {
  console.log(`Job "${name}" on task # ${taskNumber} has started.`);
}

function onTaskCompleted(name: string, taskNumber: number): void {
  console.log(`Job "${name}" on task # ${taskNumber} has completed.`);
}

function onTaskSkipping(name: string, taskNumber: number): void {
  console.error(`Job "${name}" on task # ${taskNumber} skipped.`);
}

function onTaskRetrying(name: string, taskNumber: number, attempts: number): void {
  console.error(`Job "${name}" on task # ${taskNumber} retry #${attempts}.`);
}

function onTaskFailed(name: string, taskNumber: number, err: Error): void {
  console.error(`Job "${name}" on task # ${taskNumber} has failed with error "${err.message}".`);
}

beforeAll(() => {
  tasks = new TaskManager({
    maxReties: 2,
    doNotBreakOnError: true,
    skipItemOnFail: true,
  });
  tasks.on(Events.JobStarted, onJobStarted);
  tasks.on(Events.JobCompleted, onJobCompleted);
  tasks.on(Events.JobFailed, onJobFailed);
  tasks.on(Events.JobTerminated, onjobTerminated);
  tasks.on(Events.TaskStarted, onTaskStarted);
  tasks.on(Events.TaskCompleted, onTaskCompleted);
  tasks.on(Events.TaskFailed, onTaskFailed);
  tasks.on(Events.TaskRetrying, onTaskRetrying);
  tasks.on(Events.TaskSkipping, onTaskSkipping);
});

describe('Testing TaskManager', () => {
  let weight = 0;
  let timeStarted: number;
  let timeCheckpoint: number;
  let timeCompleted: number;
  const ingredients: string[] = [];

  beforeAll(async () => {
    tasks.addJob({
      name: 'test1',
      tasks: [
        {
          delay: 0,
          data: {},
          function: async (): Promise<boolean> => {
            ingredients.push('flour');
            weight += 500;
            return true;
          },
        },
        {
          delay: 2000,
          data: {},
          function: async (): Promise<boolean> => {
            ingredients.push('eggs');
            weight += 50;
            return true;
          },
        },
        {
          delay: 1000,
          data: {},
          function: async (): Promise<boolean> => {
            ingredients.push('oil');
            weight += 20;
            timeCheckpoint = Date.now() - timeStarted;
            return true;
          },
        },
        {
          delay: 1000,
          data: {},
          function: async (): Promise<boolean> => {
            ingredients.push('milk');
            weight += 250;
            return true;
          },
        },
      ],
    });
    timeStarted = Date.now();
    await tasks.execJob('test1');
    timeCompleted = Date.now();
  });

  test('The weight total should be correct', () => {
    expect(weight).toEqual(820);
  });

  test('The last item "milk" should exist', () => {
    expect(ingredients).toContain('milk');
  });

  test('The time checkpoint should be greater than 3 seconds', () => {
    expect(timeCheckpoint).toBeGreaterThanOrEqual(3000);
  });

  test('The time checkpoint should not be greater than 3.1 seconds', () => {
    expect(timeCheckpoint).toBeLessThan(3100);
  });

  test('The total amount of time should be greater than 4 seconds', () => {
    expect(timeCompleted - timeStarted).toBeGreaterThanOrEqual(4000);
  });

  test('The total amount of time should not be greater than 4.1 seconds', () => {
    expect(timeCompleted - timeStarted).toBeLessThan(4100);
  });
});
