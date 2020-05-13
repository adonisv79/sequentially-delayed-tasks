# Sequentially Delayed Tasks (TaskManager)
This utility allows you to perform a series of tasks (functions) that will run the next task after the next one completes (or if it fails... more on handling these below). 
A group of "tasks" is called a "job" which we use to organize them. Note that this including most of my projects are written in **TypeScript**.

# Use case
Why did I make it and where did I use this? well there are several encounters I had wherein certain "stuffs" will require some delays before you call the next one. 
an example of these includes API calls where they use rate limitters and will block your IP or machine from creating calls temporarilly (or permanently) if you seem to spam the service even if its a valid request.
Another use case is where you want need something like a cron-like task that runs over a certain period of time until all tasks are completed.

# Features
* Allows creating multiple task groups (called "jobs") on a single instance
* Allows developers to set delays for each tasks added to a job
* Allows developers to set the max retry in cases where the current task fails
* Allows users to set whether the Job terminates in case of task fail(where max rety is reached or not set) or just skip the task and move to the next
* Async/Await (promise) oriented

# Setup
First install the tool using the following
```
npm i sequentially-delayed-tasks --save
```
in your TS file, write the following
```
import TaskManager from './TaskManager';

const tasks = new TaskManager();

tasks.addJob({
  name: 'test1',
  tasks: [
    {
      function: async (): Promise<boolean> => {
        console.log('Task 1 started in 0 secondth');
        return true;
      },
    },
    {
      delay: 2000,
      data: {
        val1: 'Hello',
        val2: 'World',
      },
      function: async (data): Promise<boolean> => {
        console.log('Task 2 started after 2 seconds');
        console.log(`The data says: ${data.val1} data.val2}`);
        return true;
      },
    },
    {
      delay: 1000,
      function: async (): Promise<boolean> => {
        ingredients.push('oil');
        console.log('Task 3 started after 3 seconds');
        return true;
      },
      behavior: {
        doNotBreakOnError: true,
        maxReties: 5,
      }
    },
  ],
});
await tasks.execJob('test1');
```

## Breakdown
Lets try and understand what just happened there. First we created a new instance of TaskManager. 
It can be constructed using the default with no parameter which we just did. This means it will use the default behaviors to handle tasks. 
If you need to customize these behaviors however, you will need to provide the configuration in the parameter as such...
```
const tasks = new TaskManager({
  doNotBreakOnError: true,
  maxReties: 2,
  skipItemOnFail: true,
});
```
* doNotBreakOnError (false) - Indicates that the job should not fail just because a task function threw an error .
* maxReties (default 0) - The maximum retries a task can render before it is considered a failed task.
* skipItemOnFail (default false) - Allows skipping an item if it fails and just continue to the next task.

How these 3 behaviors tie up is explained below
1. If a task (function) throws an error, it will check doNotBreakOnError (default false)
    1. If doNotBreakOnError is truthy, it will just assume that the task has failed **but was handled** and thus ***succeeded*** (or we do not care of its output)
    2. If false, this will render the job as fails and counts towards a failed attempt
2. If a task fails it will check if it has maxRetries
    1. If it has maxRetries, try the task again and increment the attempt count
    2. If it has no maxRetires set (default value 0) or it has reached its limit, go to the next step
3. Check if the skipItemOnFail is truthy (defaults to false)
    1. If its truthy then proceed to the next task in the job list
    2. If its false then invoke an Error that the maximum retry has been breached and terminate the entire job.

The next thing we did is add a new Job entry. A job entry consists of a name (which is the unique key identifier) and an array of "Task Configurations". 
These configurations require a function only as a requirement. this is the very function that will be triggered when the Job execution has activated it.
It also has other optional properties that you can set to change how the task is handled
* delay (default 0)-The ammount of time delay from the previous task completed before this task will activate
* data (default undefined)- The data object that will be passed to the function which allows us to modify the function behavior
* function (default undefined)- The asynchronous function that will be called when the time is right. The data value can be passed here if provided
* behavior (default undefined) - This is an object similar to the configuration for the TaskManager. This however aims to override the default behaviors set only for that specific task

# Events
If you need to handle certain things during each events triggering in the TaskManager, subscribe to its EventEmitter. The names are already self explanatory and their key constants can be found in the **Events** enumeration object.

```
import TaskManager, { Events } from './TaskManager';
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

const tasks = new TaskManager();
tasks.on(Events.JobStarted, onJobStarted);
tasks.on(Events.JobCompleted, onJobCompleted);
tasks.on(Events.JobFailed, onJobFailed);
tasks.on(Events.JobTerminated, onjobTerminated);
tasks.on(Events.TaskStarted, onTaskStarted);
tasks.on(Events.TaskCompleted, onTaskCompleted);
tasks.on(Events.TaskFailed, onTaskFailed);
tasks.on(Events.TaskRetrying, onTaskRetrying);
tasks.on(Events.TaskSkipping, onTaskSkipping);
```
