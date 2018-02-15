//jshint esversion:6

// Pick which function we will use
const defer = ( function(){
	if( typeof( setImmediate )==="function" && setImmediate )
		return( setImmediate );
	else if( typeof( process )==="object" && typeof( process.nextTick )==="function" )
		return( process.nextTick );
	
	// Return the default
	return( function( fn ){ setTimeout( fn, 0 ); } );

} )();

/**
 * 2nd Iteration of Serial Queue
 * Much like the first except this one carries options in the queue forward. A better way of making data available without passing a billion options.
 * @author Michael A. Leonetti
 * @date 1/30/2018
 * @copyright 2018, Sonarcloud
 * @version 12
 */
class Queue2 {
	/**
	 * C-tor
	 * @param args The arguments to start this off with
	 */
	constructor( args={} ) {
		// Make sure we are a class
		this.fns = []; //!< Storing our functions to execute in sequence
		this.args = args; //!< Arguments that will be carried over with the queue
	}

	/**
	 * Get a subqueue with this queue as the main. Automatically calls up the catch function of this main queue.
	 * @param key Where to save the remaining args
	 */
	subQueue( ...keys ) {
		// Get the fn
		const fn = keys.pop();
		
		// Get the funciton to use
		const qMe = ( cb, args )=>{

			// Okay now create a queue
			const q = new Queue2()
			.catch( e=>this._throw( e ) )
			.then( args=>cb( ...keys.map( key=>args[ key ] ) ) );

			//console.log( "have q", q );

			// Call it now
			fn( q, args, this );

		}; // End the subqueue queue

		// Queue it
		this.queueCb( ...keys, qMe );

		return( this );
	}


	/**
	 * Queue function that doesn't take a callback
	 */
	queue( ...keys ) {
		// Get the function
		const fn = keys.pop();

		// Make a function that does do callbacks
		const myFn = ( cb, args )=>{
			//console.log( "Pushing forward args", args, fn );
			// Call the callback
			cb( fn( args, this ) ); // Use the result in the callback
		};

		// Queue it
		this.queueCb( ...keys, myFn );

		// Chainable
		return( this );
	}

	/**
	 * Queue a callback session one
	 */
	queueCb( ...keys ) {
		// Pre-emptively get the length
		const length = this.fns.length;

		//console.log( "Pushed keys", keys );

		// Add it in total
		this.fns.push( keys );

		// We already had functions, so don't call
		if( length )
			return( this ); // Chainable

		// Call it now
		this._callQueueFn( this.fns[ 0 ] );

		// Chain gang
		return( this );
	}

	/**
	 * Queue up a promise. Shorthand for handling cb
	 */
	/*
	queuePromise( fn ) {
		this.queueCb( ( cb, ...args )=>{
			// Call the function
			const p = fn( ...args );
			// Use the promise
			p
			.then( r=>cb( null, r ) )
			.catch( cb );
		} );

		return( this );
	}
	*/

	/**
	 * Deal with the next key in the array. Invented so Promise callbacks could be used. Recurses where necessary.
	 * @param keys All of the keys.
	 * @param values All of the values associated with the keys.
	 * @param index Next index to pop off
	 */
	_nextKey( keys, values, index=0 ) {
		// Keep processing all keys and values (process values also to make sure all promises are done)
		if( index>=keys.length && index>=values.length ) {
			// Go next
			this._nextFn();
			// No more of us
			return;
		}

		const key = keys[ index ]; // Get the next key
		const value = values[ index ]; // Get the next value

		// Custom value handler
		if( value!=null && value.then instanceof Function ) { // Is promise. Requires async handling.
			// Use the promise way
			value
			.then( value=>{
				// Set the value
				this._setValue( key, value, index );
				// Go next
				this._nextKey( keys, values, index+1 );
			} )
			.catch( e=>this._throw( e ) );
			// No more
			return;
		}

		// Default set value
		this._setValue( key, value, index );

		// Go next
		this._nextKey( keys, values, index+1 );
	}

	/**
	 * Set the value based on the key
	 */
	_setValue( key, value, index ) {
		
		// Cheque
		if( key==null )
			return; // Test not
		else if( key==Error ) { // Error key
			if( value instanceof Error )
				this._throw( value ); // Throw it
		}
		else if( key==Array ) // It's an array
			Object.assign( this.args, value ); // Merge
		else if( key==Object ) // It's an object
			Object.assign( this.args, value ); // Merge
		else if( typeof( key )==="object" && !Array.isArray( key ) ) { // We have special instructions
			// Look each key and perform actions for it
			for( const k in key ) {
				if( !key.hasOwnProperty( k ) )
					continue;

				// Get the value
				const v = key[ k ];

				// Loop through which type
				switch( k ) {
					case '$set': // Set the value
						this.args[ v ] = value;
						break;
					case '$push': // Add to an array
						this.args[ v ].push( value );
						break;
					case '$pick': { // Pick from the object what we need
						// Is an array?
						if( v instanceof Array )
							v.forEach( v=>this.args[ v ] = value[ v ] ); // Pick each
						else
							this.args[ v ] = value[ v ]; // Pick only the one we have

					}	break;
				}
			}
		}
		else
			this.args[ key ] = value; // Add it
	}

	/**
	 * The callback function used in queueFn
	 * @param keys Key arguments we have incoming. This is what the user specified the output would look like.
	 * @param values Values the user specified in the return.
	 */
	_callback( keys, values ) {
		//console.log( "Callback" );

		// Remove the top
		this.fns.shift();

		// Start the set value functions
		this._nextKey( keys, values );
	}

	/**
	 * Our custom throw
	 */
	_throw( e ) {
		// Are we catching?
		if( this.catchFn instanceof Function )
			this.catchFn( e ); // Use the catch function
		else
			throw e; // Throw... up
	}

	/**
	 * Call the next function in the queue
	 */
	_callQueueFn( keys ) {
		//console.log( "Calling function is ", fn );
		// Call next tick so async
		defer( ()=>{

			//console.log( "Keez", keys );

			// Get the function from the last place in the args
			const fn = keys.pop();

			// To ensure calling only once
			let executed=false;

			try {
				// Call the function
				fn( ( ...values )=>{
					// Ensure calling only once
					if( executed )
						return;

					// We are executed
					executed = true;

					// Now the actual guts
					this._callback( keys, values );
				}, this.args, this );
			}
			catch( e ) {
				this._throw( e );
			}

		} );
	}

	/**
	 * Call the next function
	 */
	_nextFn() {
		// None to call?
		if( !this.fns.length ) {
			// Call the then
			this._callThen();
			// Stop here
			return;
		}

		// We have more!
		this._callQueueFn( this.fns[ 0 ] );
	}
	
	/**
	 * Call the then function if we have one
	 */
	_callThen() {
		// We have a then?
		if( this.thenFn instanceof Function ) {
			// Save it
			const fn = this.thenFn;
			// Delete it
			this.thenFn = undefined;
			// Wrap it in case
			try {
				// Call it
				fn( this.args, this );
			}
			catch( e ) {
				this._throw( e );
			}
		}
	}

	/**
	 * Done function - Effectively clear the queue and then call the thenFn if there is one
	 */
	done() {
		// Empty our queue
		this.fns = [];
		// Call then
		this._callThen();
	}

	/**
	 * Set a catch function
	 */
	catch( fn ) {
		this.catchFn = fn;
		return( this );
	}

	/**
	 * Set a finished function
	 */
	then( fn ) {
		this.thenFn = fn;
		return( this );
	}

}

/**
 * Serial Function Queue
 * Runs a series of functions one after another
 * @author Michael A. Leonetti
 * @date 5/4/2015
 * @copyright 2017, Parentglue
 * @version 8
 */
class Queue {
	/**
	 * C-tor
	 */
	constructor() {
		// Make sure we are a class
		this.fns = [];
		this.args = []; // The last arguments passed
	}

	/**
	 * Queue function that doesn't take a callback
	 */
	queue( fn ) {
		// Make a function that does do callbacks
		const myFn = ( cb, ...args )=>{
			// Pay it forward
			fn.apply( this, args );
			// Call the callback
			cb();
		};

		// Queue it
		this.queueCb( myFn );

		// Chainable
		return( this );
	}

	/**
	 * Queue a callback session one
	 */
	queueCb( fn ) {
		// Pre-emptively get the length
		const length = this.fns.length;

		// Add it
		this.fns.push( fn );

		// We already had functions, so don't call
		if( length )
			return( this ); // Chainable

			// Call it now
			this._callQueueFn( this.fns[ 0 ] );

			// Chain gang
			return( this );
	}

	/**
	 * Queue up a promise. Shorthand for handling cb
	 */
	queuePromise( fn ) {
		this.queueCb( ( cb, ...args )=>{
			// Call the function
			const p = fn( ...args );
			// Use the promise
			p
			.then( r=>cb( null, r ) )
			.catch( cb );
		} );

		return( this );
	}

	/**
	 * Call the next function in the queue
	 */
	_callQueueFn( fn ) {
		//console.log( "Calling function is ", fn );
		// Call next tick so async
		defer( ()=>{
			// Ensure calling only once
			let executed = false;

			// Make our callby
			const cb = ( ...args )=>{
				// Have we alread been called?
				if( executed )
					return;

				// Stop after executions
				executed = true;

				//console.log( "William", args );
				// Take the first function away
				this.fns.shift();

				if( this.catchFn instanceof Function ) {
					// Error?
					if( args[ 0 ] ) {
						//console.log( "Error is: ", args );
						// Clear the args
						this.args = [];
						// Error out
						this.catchFn.apply( this, args ); // Whoops
					}
					else { // No error
						// Take out the first if there is
						if( args.length )
							args.shift();

						// Save it
						this.args = args;

						// Call it
						this._nextFn();
					}
				}
				else {
					// Save the args
					this.args = args;
					// Call the next fn
					this._nextFn();
				}

			};

			// Are we catching?
			if( this.catchFn instanceof Function ) {
				// Call and wrap in try/catch
				try {
					// Call and wrap to catch
					fn.call( this, cb, ...this.args ); // Using the spread syntax. Hope it's faster than adding to the array.
				}
				catch( e ) {
					// Call it
					this.catchFn.call( this, e );
				}
			}
			else {
				// Call but don't wrap
				fn.call( this, cb, ...this.args ); // Using the spread syntax. Hope it's faster than adding to the array.
			}
		} );
	}

	/**
	 * Call the next function
	 */
	_nextFn() {
		// None to call?
		if( !this.fns.length ) {
			// We have a then?
			if( this.thenFn instanceof Function ) {
				// Save it
				const fn = this.thenFn;
				// Delete it
				this.thenFn = undefined;
				// Call it
				fn.call( this );
			}
			// Stop here
			return;
		}

		// We have more!
		this._callQueueFn( this.fns[ 0 ] );
	}

	/**
	 * Set a catch function
	 */
	catch( fn ) {
		this.catchFn = fn;
		return( this );
	}

	/**
	 * Set a finished function
	 */
	then( fn ) {
		this.thenFn = fn;
		return( this );
	}

}

const that = function( ...args ) { return( new Queue( ...args ) ); }; // To be able to call it without saying New
// Add the defer function
that.defer = defer;

that.v2 = function( ...args ) { return( new Queue2( ...args ) ); }; // Second version


/**
 * Recursive mapper
 */
that.map = function( array, callback ) {
	// Keep it up
	return( new Promise( ( resolve, reject )=>{
		// The result array
		const result = [];

		// Our queue
		const q = new Queue()
		.catch( reject ); // On error

		// Loop and weakling
		array.forEach( value=>
			q
			.queueCb(
				done=>callback( done, value )
			)
			.queue( value=>result.push( value ) )
		);

		// Lastly
		q.queue( ()=>resolve( result ) );

	} ) );
};

// Export it all
module.exports = that;
