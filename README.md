# serial-queue
JavaScript library to ensure functions are called in a serial sequence.

In short, SerialQueue is used as a way to remedy JavaScript's callback hell and/or to ensure that operations that need to be done in sequence occur in sequence.

## Short demo
### SerialQueue.v2
#### Trivial Example
```javascript
SerialQueue()
.catch( error=>console.error( "Had an issue" ) )
.queueCb( "array", "string", cb=>cb( [ 'one' ], "hello" ) )
.queueCb( Error, "second", ( cb, args )=>{
	// Output
	// { array: [ 'one' ], string: 'hello' }
	console.log( args );
	
	cb( null, "test" );
} )
.queue( "more", args=>{
	// Output
	// { array: [ 'one' ], string: 'hello', second: 'test' }
	console.log( args );
	
	return( "save me" );
} )
.queue( { $push : "array" }, args=>{
	// Output
	// { array: [ 'one' ],
	//   string: 'hello',
	//   second: 'test',
	//   more: 'save me' }
	console.log( args );
	
	return( "two" );
} )
.then( args=>{
	// Output
	// { array: [ 'one', 'two' ],
	//   string: 'hello',
	//   second: 'test',
	//   more: 'save me' }
	console.log( args );
} );
```
#### Real world example
```javascript
// Use the second generation SerialQueue that accumulates all variables in the queue internally
const SerialQueue = require( 'serial-queue' ).v2;

SerialQueue()
// Catch any thrown error, callback error, or promise error
.catch( error=>console.error( "We've hit a snag.", error ) )
// Get a user by an ID from the database and store it as "user". This function will go to the next in queue when finished.
.queue( "user", ()=>User.findById( "5a849c4834271742d17b5354" ).exec() ) // Returns a promise automatically handled storing it's positive value in "user"
// Test to see if we got a user. This function will not go to the next in queue until the callback is called.
.queueCb( ( cb, args )=>{ // "user" is now a key in the args object
	if( !args.user ) {
		console.error( "User was not found." );
		return; // cb is never called so the queue halts here
	}

	cb(); // Continue on
} )
// Read a file using the previous result. Specifies that the cb should expect two parameters, first being an Error and second should be saved as "lines".
.queueCb( Error, "lines", ( cb, { user } )=>fs.readFile( user.logfile, cb ) ) // Destructure syntax on the args object makes life easier
.queue( ( { lines, user } )=>{
	// Loop though the file lines
	lines.toString( 'utf8' ).split( '\n' )
	.forEach( line=>user.logs.push( line ) ); // Push it to the user object
	
	// Save the user
	return( user.save() ); // .save() should be a promise. Throws on reject, continues on resolve.
} )
// Delete the logfile. Throw on error.
.queueCb( Error, ( cb, { user } )=>fs.unlink( user.logfile, cb ) )
// Trivial function to parse out how many lines added and the username
.queueCb( "count", "name", ( cb, { lines, user } )=>cb( lines.length, user.name ) ); // callback will take the first arg put it in count, and second and put it in name
// .then is called after all queue callbacks executed
.then( args=>{
	console.log( "User %s had %d lines added to him.", args.name, args.count );
	process.exit( 0 );
} );
```

### SerialQueue
#### Trivial example
```javascript
// Simple queue that just takes whatever variables were passed to the callback and sends them
// as the params for the next item
const SerialQueue = require( 'serial-queue' );

SerialQueue()
.queueCb( cb=>{
	// Read a file
	fs.readFile( "testfile.txt", cb )
} )
.queueCb( ( cb, error, data )=>{
	// Did we have an error?
	if( error ) {
		console.error( "Error reading file", error );
		return; // Don't continue
	}

	// Callback
	cb( data.toString( 'utf8' ) );
} )
// Callbackless version
.queue( string=>console.log( "Read file", string ) )
.then( ()=>{
	console.log( "Finished." );
	process.exit( 0 );
} );
```
# Reference
## SerialQueue.v2
Second generation SerialQueue module.
### A new SerialQueue
```javascript
// Include the module and make sure to add the .v2
const SerialQueue = require( 'serial-queue' ).v2;

const q = SerialQueue()
// or
const q = new SerialQueue();
```
Constructor also takes an option of an object. This object will be used as the seed for the internal args variable that accumulates variables as you progress in the queue.
```javascript
SerialQueue( { 'test' : 4 } )
// Will display "4"
.queue( args=>console.log( args.test ) );
```
### catch( cb )
Catches any errors thrown inside of or passed to the SerialQueue. Takes a callback (function(error)) as an argument. Function is chainable.

*Note: When an error is caught in the queue, execution is halted and the queue is not continued. Also if this is not specified, SerialQueue will throw instead.*

```javascript
SerialQueue()
.catch( error=>console.error( error ) )
.queueCb( Error, cb=>{
	cb( new Error( "This will be thrown" ) ); // Will output this immediately
} );
```
### then( cb )
Assign a callback that is the last callback in the queue when all other queue functions have been executed. This is optional. It is only called once. It takes a callback function (function(args)) that is passed the args variable. Function is chainable.

```javascript
SerialQueue()
.then( args=>console.log( "Executed last with args", args ) )
.queue( ()=>console.log( "Executed first" ) )
.queue( ()=>console.log( "Executed second" ) )
.queue( ()=>console.log( "Executed third" ) );
```
### queueCb( key1, key2, key3, ..., cb )
Queue a function that will end with a callback. The callback function will be sent a done function (to call when the queued function is done), the args variable, and the current queue (function(done,args,queue)).

The function takes any number of optional arguments preceeding the mandatory callback. The optional arguments specify what to expect the done function to be called with. The arguments of the done function will be dealt with as each key specified. For example, if key1 is "hello" and the first argument of the done function is "there", SerialQueue's internal args will look like { 'hello' : "there" }.

#### Promise handling
If the *done* function is called with promises as the parameters then each promise is executed in a serial sequence. The next item in the queue is not executed until the last promise finishes. The promise result will be stored according to the key provided. If no key is provided for the promise, the promise is executed, but the result is discarded. If the promise is rejected, SerialQueue will call the *catch* function or throw.

#### Key Types
Special keys can be used as special instructions with what to do with the results.

| Modifier  | Result |
| ------------- | ------------- |
| Any quoted string  | The result stored in the SerialQueue internal args variable using the key provided in the string. |
| Error  | If this is an error object, it'll throw the error object.  |
| Array  | The result will be merged into the args object. |
| Object  | The result will be merged into the args object. |

Example:
```javascript
SerialQueue()
.catch( error=>console.error( error ) )
.queueCb( Error, "filename", cb=>{ // Specify excting to see Error, and "filename"
	// Won't throw because Error is null
	cb( null, "testfile.log" );
} )
.queueCb( Array, ( cb, args )=>{
	// Outputs:
	// { filename: 'testfile.log' }
	console.log( args );

	// Merge an array in
	cb( [ "zero", "one", "two" ] );
} )
.queueCb( Object, ( cb, args )=>{
	// Outputs:
	// { '0': 'zero', '1': 'one', '2': 'two', filename: 'testfile.log' }
	console.log( args );

	// Merge an object in
	cb( { 'penguin': "yellow", 'glass' : "blue" } );
} )
.then( args=>{
	// Outputs:
	// { '0': 'zero',
	//   '1': 'one',
	//   '2': 'two',
	//   filename: 'testfile.log',
	//   penguin: 'yellow',
	//   glass: 'blue' }
	console.log( args );
} );
```
#### Special Instructions in Keys
Keys can be special 

| Modifier  | Result |
| ------------- | ------------- |
| $set  | The same as specifying just a string for a key. |
| $push  | Pushes the result into the array specified by the key. |
| $pick  | Pick the specified keys from the result object and add it to the keys in the args. |

##### Examples
###### $set
```javascript
SerialQueue()
.queueCb( { $set : "hello" }, cb=>"there" )
.then( args=>console.log( args ) );
// Outputs:
// { hello: 'there' }
```
###### $push
```javascript
SerialQueue()
.queueCb( "array", cb=>cb( [] ) )
.queueCb( { $push : "array" }, cb=>cb( "there" ) )
.queueCb( { $push : "array" }, cb=>cb( "we" ) )
.queueCb( { $push : "array" }, cb=>cb( "go" ) )
.then( args=>console.log( args ) );
// Outputs:
// { array: [ 'there', 'we', 'go' ] }
```
###### $pick
```javascript
SerialQueue()
.queueCb( { $pick : "one" }, cb=>cb( { 'one' : 1, 'two' : 2, 'three' : 3 } ) )
.then( args=>console.log( args ) );
// Outputs:
// { one: 1 }
```

### queue( [key1], cb )
Basically the same idea as the queueCb function except it will always call the next queued function (unless an error is thrown) and does not wait for a callback. Only the first key is applicable and the return value of the queued function is intepreted as the variable.

If a promise is returned from the function, it is handled and the result is put into the SerialQueue args. The next function in the queue will not be executed until the promise completes.

#### Examples
```javascript
SerialQueue()
.queue( "hello", ()=>"there" )
.queue( "users", ()=>[] )
.queue( { $push : "users" }, ()=>"frank" )
.then( args=>console.log( args ) );
// Outputs:
// { hello: 'there', users: [ 'frank' ] }
```
## SerialQueue
The theory behind SerialQueue is a lot like SerialQueue.v2 but it is more aimed a more simple queue mechanism. There is no internal args variable passed to each queue function. Instead, the parameters from the previous done function are passed to the next function in the queue.

As with SerialQueue.v2 all functions are chainable for easier use.
### A new SerialQueue
```javascript
// Include the module. Notice there is no .v2
const SerialQueue = require( 'serial-queue' );

const q = SerialQueue()
// or
const q = new SerialQueue();
```
### catch( cb )
Attaches an error catcher function to the queue. When this is specified it changes the behaviour of the queue functions. When the cb is set to anything but null, the first parameter of every done function is treated as an error. If it's not null, it'll throw. Also, all errors thrown within the queued funcitons that aren't caught are thrown to this function.

Takes a callback function like function(error)

#### Behaviour with catch
```javascript
SerialQueue()
.catch( error=>console.log( error ) )
.queueCb( cb=>cb( new Error( "I will be thrown." ) ) )
.queue( ()=>console.log( "I will never be reached." ) );
```
#### Behaviour without catch
```javascript
SerialQueue()
.queueCb( cb=>cb( new Error( "I will NOT be thrown." ) ) )
.queue( error=>console.log( "I am reached. And here's the error.", error ) );
```
### then( cb )
After the last function is called in the queue, if this is set, this callback function will be called. The callback function will be called with no parameters. If an error has been thrown, this will never be called. This is entirely optional. This callback function will be called exactly once. After it is called it will need to be re-set.
### queueCb( cb )
Queues a function for execution.

The callback function should expect the following parameters, function(done,...args) where *done* must be called when the function is complete and *...args* is a list of optional arguments that were passed to the *last* done function.

*Note that the first argument passed to the done function will throw when catch has been set on the queue.*
#### Example
```javascript
SerialQueue()
.queueCb( cb=>cb( "hello", "there" ) )
.queueCb( ( cb, arg1, arg2 )=>{
	// Output:
	// String 1=hello, 2=there
	console.log( "String 1=%s, 2=%s", arg1, arg2 );

	cb( "last" );
} )
.queueCb( ( cb, arg1 )=>{
	// Output:
	// String is last
	console.log( "String is %s", arg1 );

	cb();
} )
```
### queue( cb )
Is a lot like the queueCb function except there is no done function that needs to be called at the end. The callback function looks like this function(...args) where args are the arguments called by the previous done function where applicable.
```javascript
SerialQueue()
.queueCb( cb=>cb( "hello", "there" ) )
.queue( ( arg1, arg2 )=>{
	// Output:
	// String 1=hello, 2=there
	console.log( "String 1=%s, 2=%s", arg1, arg2 );
} );
```
# Contact Info
Feel free to contact me for any questions/comments. I'm available at mikealeonetti [at] gmail.com. Feel free to also post bug reports and questions in the issues section as well!
