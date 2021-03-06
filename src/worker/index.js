import MESSAGE_TYPES from '../MESSAGE_TYPES';
import BODY_TYPES from '../BODY_TYPES';
import CONSTRAINT_TYPES from '../CONSTRAINT_TYPES';
import CONTACT_TYPES from '../CONTACT_TYPES';

// trick rollup into including Goblin
import {} from '../../lib/goblin.min';
var Goblin = self.Goblin || _goblin;

var _tmp_vector3_1 = new Goblin.Vector3();
var _tmp_vector3_2 = new Goblin.Vector3();

// report-related variables and constants
function ensureReportSize( report, report_size, chunk_size ) {
	var needed_buffer_size = ( report_size + 3 ) + chunk_size - report_size % chunk_size; // the +2 is to
		// add an array element to hold the report type, number of ticks simulation has gone through, and length of array data
	if ( report.length < needed_buffer_size ) {
		report = new Float32Array( needed_buffer_size );
	}
	return report;
}
var WORLD_REPORT_SIZE_RIGIDBODY = 30; // 1 body id + 16 matrix elements + 3 position elements + 4 rotation elements + 3 linear velocity + 3 angular_velocity
var WORLD_REPORT_CHUNK_SIZE = 100 * WORLD_REPORT_SIZE_RIGIDBODY; // increase buffer by enough to hold 100 objects each time
var world_report = new Float32Array( 0 );

var COLLISION_REPORT_SIZE = 16; // 2 body ids + 4 Vector3s + penetration depth
var COLLISION_REPORT_CHUNK_SIZE = 100 * COLLISION_REPORT_SIZE;
var collision_report = new Float32Array( 0 );

var CONSTRAINT_REPORT_SIZE = 5; // 1 constraint id + 1 element for active flag + 3 elements for last impulse
var CONSTRAINT_REPORT_CHUNK_SIZE = 10 * CONSTRAINT_REPORT_SIZE;
var constraint_report = new Float32Array( 0 );

// global variables for the simulation
var world;
var id_body_map = {}; // maps scene's body ids (provided from Physijs) to body
var body_id_map = {}; //  // maps the goblin body id to Physijs' body id
var id_constraint_map = {}; // maps the constraint ids (provided from Physijs) to body
var constraint_id_map = {}; // maps the goblin constraint id to Physijs' constraint id
var collision_events = [];

function postMessage( type, parameters ) {
	self.postMessage({
		type: type,
		parameters: parameters
	});
}

function postReport( report ) {
	self.postMessage( report, [report.buffer] );
}

function reportWorld() {
	// compute necessary buffer size
	var rigid_body_ids = Object.keys( id_body_map );
	var rigid_bodies_count = rigid_body_ids.length;
	var report_size = ( WORLD_REPORT_SIZE_RIGIDBODY * rigid_bodies_count ); // elements needed to report bodies
	world_report = ensureReportSize( world_report, report_size, WORLD_REPORT_CHUNK_SIZE );

	// populate the report
	var idx = 0;
	world_report[idx++] = MESSAGE_TYPES.REPORTS.WORLD;
	world_report[idx++] = world.ticks;
	world_report[idx++] = rigid_bodies_count;

	for ( var i = 0; i < rigid_bodies_count; i++ ) {
		var rigid_body_id = rigid_body_ids[ i ];
		var rigid_body = id_body_map[ rigid_body_id ];
		world_report[idx++] = rigid_body_id;

		world_report[idx++] = rigid_body.transform.e00;
		world_report[idx++] = rigid_body.transform.e01;
		world_report[idx++] = rigid_body.transform.e02;
		world_report[idx++] = rigid_body.transform.e03;

		world_report[idx++] = rigid_body.transform.e10;
		world_report[idx++] = rigid_body.transform.e11;
		world_report[idx++] = rigid_body.transform.e12;
		world_report[idx++] = rigid_body.transform.e13;

		world_report[idx++] = rigid_body.transform.e20;
		world_report[idx++] = rigid_body.transform.e21;
		world_report[idx++] = rigid_body.transform.e22;
		world_report[idx++] = rigid_body.transform.e23;

		world_report[idx++] = rigid_body.transform.e30;
		world_report[idx++] = rigid_body.transform.e31;
		world_report[idx++] = rigid_body.transform.e32;
		world_report[idx++] = rigid_body.transform.e33;

		world_report[idx++] = rigid_body.position.x;
		world_report[idx++] = rigid_body.position.y;
		world_report[idx++] = rigid_body.position.z;

		world_report[idx++] = rigid_body.rotation.x;
		world_report[idx++] = rigid_body.rotation.y;
		world_report[idx++] = rigid_body.rotation.z;
		world_report[idx++] = rigid_body.rotation.w;

		world_report[idx++] = rigid_body.linear_velocity.x;
		world_report[idx++] = rigid_body.linear_velocity.y;
		world_report[idx++] = rigid_body.linear_velocity.z;

		world_report[idx++] = rigid_body.angular_velocity.x;
		world_report[idx++] = rigid_body.angular_velocity.y;
		world_report[idx++] = rigid_body.angular_velocity.z;
	}

	postReport( world_report );
}

function reportCollisions() {
	// divided by 2 because each new collision triggers two `contact` events and the second is a duplicate
	// divided by 10 as each entry in `collision_events` spans ten indices
	var event_size = 10;
	var collision_events_count = collision_events.length / 2 / event_size;

	// compute buffer size
	var report_size = ( COLLISION_REPORT_SIZE * collision_events_count ); // elements needed to report collisions
	collision_report = ensureReportSize( collision_report, report_size, COLLISION_REPORT_CHUNK_SIZE );
	collision_report[0] = MESSAGE_TYPES.REPORTS.COLLISIONS;
	collision_report[1] = collision_events_count;

	var report_idx = 2;

	for ( var i = 0; i < collision_events.length; i += 2 * event_size ) { // multiply by 2 to skip the same contact event for the other object
		var object_a = collision_events[i+1];
		var object_b = collision_events[i+2];
		var contact = collision_events[i+3];

		collision_report[report_idx+0] = collision_events[i+0];

		collision_report[report_idx+1] = body_id_map[ object_a.id ];
		collision_report[report_idx+2] = body_id_map[ object_b.id ];

		collision_report[report_idx+3] = contact ? contact.contact_point.x : 0;
		collision_report[report_idx+4] = contact ? contact.contact_point.y : 0;
		collision_report[report_idx+5] = contact ? contact.contact_point.z : 0;

		collision_report[report_idx+6] = contact ? contact.contact_normal.x : 0;
		collision_report[report_idx+7] = contact ? contact.contact_normal.y : 0;
		collision_report[report_idx+8] = contact ? contact.contact_normal.z : 0;

		collision_report[report_idx+9] = collision_events[i+4];
		collision_report[report_idx+10] = collision_events[i+5];
		collision_report[report_idx+11] = collision_events[i+6];

		collision_report[report_idx+12] = collision_events[i+7];
		collision_report[report_idx+13] = collision_events[i+8];
		collision_report[report_idx+14] = collision_events[i+9];

		collision_report[report_idx+15] = contact ? contact.penetration_depth : 0;

		report_idx += COLLISION_REPORT_SIZE;
	}

	collision_events.length = 0;

	postReport( collision_report );
}

function reportConstraints() {
	// compute necessary buffer size
	var constraint_ids = Object.keys( id_constraint_map );
	var constraints_count = constraint_ids.length;
	var report_size = ( CONSTRAINT_REPORT_SIZE * constraints_count ); // elements needed to report bodies
	constraint_report = ensureReportSize( constraint_report, report_size, CONSTRAINT_REPORT_CHUNK_SIZE );

	// populate the report
	var report_idx = 0;
	constraint_report[report_idx++] = MESSAGE_TYPES.REPORTS.CONSTRAINTS;
	constraint_report[report_idx++] = constraints_count;

	for ( var i = 0; i < constraints_count; i++ ) {
		var constraint_id = constraint_ids[ i ];
		var constraint = id_constraint_map[ constraint_id ];
		constraint_report[report_idx] = constraint_id;

		constraint_report[report_idx+1] = constraint.active;

		constraint_report[report_idx+2] = constraint.last_impulse.x;
		constraint_report[report_idx+3] = constraint.last_impulse.y;
		constraint_report[report_idx+4] = constraint.last_impulse.z;

		report_idx += CONSTRAINT_REPORT_SIZE;
	}

	postReport( constraint_report );
}

function getShapeForDefinition( shape_definition ) {
	var shape;

	if ( shape_definition.body_type === BODY_TYPES.BOX ) {
		shape = new Goblin.BoxShape(shape_definition.width, shape_definition.height, shape_definition.depth);
	} else if ( shape_definition.body_type === BODY_TYPES.COMPOUND ) {
		shape = new Goblin.CompoundShape();
		shape_definition.shapes.forEach(function( child_shape ) {
			shape.addChildShape(
				getShapeForDefinition( child_shape.shape_definition ),
				new Goblin.Vector3( child_shape.position.x, child_shape.position.y, child_shape.position.z ),
				new Goblin.Quaternion( child_shape.quaternion.x, child_shape.quaternion.y, child_shape.quaternion.z, child_shape.quaternion.w )
			);
		});
	} else if ( shape_definition.body_type === BODY_TYPES.CONE ) {
		shape = new Goblin.ConeShape(shape_definition.radius, shape_definition.height);
	} else if ( shape_definition.body_type === BODY_TYPES.CONVEX ) {
		shape = new Goblin.ConvexShape(
			shape_definition.vertices.reduce(
				function( vertices, component, idx, source ) {
					if (idx % 3 == 0) {
						vertices.push(
							new Goblin.Vector3( source[idx], source[idx+1], source[idx+2] )
						);
					}
					return vertices;
				},
				[]
			)
		);
	} else if ( shape_definition.body_type === BODY_TYPES.CYLINDER ) {
		shape = new Goblin.CylinderShape( shape_definition.radius, shape_definition.height );
	} else if ( shape_definition.body_type === BODY_TYPES.PLANE ) {
		shape = new Goblin.PlaneShape( 2, shape_definition.width, shape_definition.height );
	} else if ( shape_definition.body_type === BODY_TYPES.SPHERE ) {
		shape = new Goblin.SphereShape( shape_definition.radius );
	} else if ( shape_definition.body_type === BODY_TYPES.TRIANGLE ) {
		shape = new Goblin.MeshShape(
			shape_definition.vertices.reduce(
				function( vertices, component, idx, source ) {
					if (idx % 3 == 0) {
						vertices.push(
							new Goblin.Vector3( source[idx], source[idx+1], source[idx+2] )
						);
					}
					return vertices;
				},
				[]
			),
			shape_definition.faces
		);
	}

	return shape;
}

// message handling
(function() {
	var handlers = {};
	function handleMessage( message, handler ) {
		handlers[message] = handler;
	}
	self.addEventListener(
		'message',
		function(e) {
			var data = e.data;
			var type;
			var parameters;

			if ( data instanceof Float32Array ) {
				type = data[0];
				parameters = data;
			} else {
				data = data || {};
				type = data.type;
				parameters = data.parameters;
			}

			if ( handlers.hasOwnProperty( type ) ) {
				handlers[type]( parameters );
			} else {
				throw new Error( 'Physijs worker received unknown message type: ' + type );
			}
		}
	);

	handleMessage(
		MESSAGE_TYPES.REPORTS.WORLD,
		function( report ) {
			world_report = report;
		}
	);

	handleMessage(
		MESSAGE_TYPES.REPORTS.COLLISIONS,
		function( report ) {
			collision_report = report;
		}
	);

	handleMessage(
		MESSAGE_TYPES.REPORTS.CONSTRAINTS,
		function( report ) {
			constraint_report = report;
		}
	);

	handleMessage(
		MESSAGE_TYPES.INITIALIZE,
		function( parameters ) {
			var broadphase = parameters.broadphase === 'naive' ? new Goblin.BasicBroadphase() : new Goblin.SAPBroadphase();

			world = new Goblin.World(
				broadphase,
				new Goblin.NarrowPhase(),
				new Goblin.IterativeSolver()
			);

			if ( parameters.hasOwnProperty('gravity') ) {
				world.gravity.set( parameters.gravity.x, parameters.gravity.y, parameters.gravity.z );
			}

			if ( parameters.hasOwnProperty('solver_max_iterations') ) {
				world.solver.max_iterations = parameters.solver_max_iterations;
			}
		}
	);

	handleMessage(
		MESSAGE_TYPES.ADD_GHOSTBODY,
		function( parameters ) {
			var shape_definition = parameters.shape_definition;
			var shape = getShapeForDefinition( shape_definition );
			var body = new Goblin.GhostBody( shape );

			body.collision_groups = parameters.collision_groups;
			body.collision_mask = parameters.collision_mask;

			body.addListener(
				'contact',
				function( other_body, contact ) {
					collision_events.push( CONTACT_TYPES.START, this, other_body, contact );

					// find relative velocities
					_tmp_vector3_1.subtractVectors( other_body.linear_velocity, this.linear_velocity );
					collision_events.push( _tmp_vector3_1.x, _tmp_vector3_1.y, _tmp_vector3_1.z );

					_tmp_vector3_1.subtractVectors( other_body.angular_velocity, this.angular_velocity );
					collision_events.push( _tmp_vector3_1.x, _tmp_vector3_1.y, _tmp_vector3_1.z );
				}
			);

			body.addListener(
				'endAllContact',
				function( other_body ) {
					collision_events.push( CONTACT_TYPES.END, this, other_body, null );

					// find relative velocities
					_tmp_vector3_1.subtractVectors( other_body.linear_velocity, this.linear_velocity );
					collision_events.push( _tmp_vector3_1.x, _tmp_vector3_1.y, _tmp_vector3_1.z );

					_tmp_vector3_1.subtractVectors( other_body.angular_velocity, this.angular_velocity );
					collision_events.push( _tmp_vector3_1.x, _tmp_vector3_1.y, _tmp_vector3_1.z );
				}
			);

			body.addListener(
				'contactStart',
				function( other_body, contact ) {
					collision_events.push( CONTACT_TYPES.START, this, other_body, contact );

					// find relative velocities
					collision_events.push( other_body.linear_velocity.x, other_body.linear_velocity.y, other_body.linear_velocity.z );
					collision_events.push( other_body.angular_velocity.x, other_body.angular_velocity.y, other_body.angular_velocity.z );
				}
			);

			body.addListener(
				'contactContinue',
				function( other_body, contact ) {
					collision_events.push( CONTACT_TYPES.CONTINUE, this, other_body, contact );

					// find relative velocities
					collision_events.push( other_body.linear_velocity.x, other_body.linear_velocity.y, other_body.linear_velocity.z );
					collision_events.push( other_body.angular_velocity.x, other_body.angular_velocity.y, other_body.angular_velocity.z );
				}
			);

			body.addListener(
				'contactEnd',
				function( other_body ) {
					collision_events.push( CONTACT_TYPES.END, this, other_body, null );

					// find relative velocities
					collision_events.push( other_body.linear_velocity.x, other_body.linear_velocity.y, other_body.linear_velocity.z );
					collision_events.push( other_body.angular_velocity.x, other_body.angular_velocity.y, other_body.angular_velocity.z );
				}
			);

			world.addGhostBody( body );

			id_body_map[ parameters.body_id ] = body;
			body_id_map[ body.id ] = parameters.body_id;
		}
	);

	handleMessage(
		MESSAGE_TYPES.ADD_RIGIDBODY,
		function( parameters ) {
			var shape_definition = parameters.shape_definition;
			var shape = getShapeForDefinition( shape_definition );
			var body = new Goblin.RigidBody( shape, parameters.mass );

			body.restitution = parameters.restitution;
			body.friction = parameters.friction;
			body.linear_damping = parameters.linear_damping;
			body.angular_damping = parameters.angular_damping;
			body.collision_groups = parameters.collision_groups;
			body.collision_mask = parameters.collision_mask;

			body.addListener(
				'contact',
				function( other_body, contact ) {
					collision_events.push( CONTACT_TYPES.START, this, other_body, contact );

					// find relative velocities
					_tmp_vector3_1.subtractVectors( other_body.linear_velocity, this.linear_velocity );
					collision_events.push( _tmp_vector3_1.x, _tmp_vector3_1.y, _tmp_vector3_1.z );

					_tmp_vector3_1.subtractVectors( other_body.angular_velocity, this.angular_velocity );
					collision_events.push( _tmp_vector3_1.x, _tmp_vector3_1.y, _tmp_vector3_1.z );
				}
			);

			body.addListener(
				'endAllContact',
				function( other_body ) {
					collision_events.push( CONTACT_TYPES.END, this, other_body, null );

					// find relative velocities
					_tmp_vector3_1.subtractVectors( other_body.linear_velocity, this.linear_velocity );
					collision_events.push( _tmp_vector3_1.x, _tmp_vector3_1.y, _tmp_vector3_1.z );

					_tmp_vector3_1.subtractVectors( other_body.angular_velocity, this.angular_velocity );
					collision_events.push( _tmp_vector3_1.x, _tmp_vector3_1.y, _tmp_vector3_1.z );
				}
			);

			body.addListener(
				'contactStart',
				function( other_body, contact ) {
					collision_events.push( CONTACT_TYPES.START, this, other_body, contact );

					// find relative velocities
					collision_events.push( this.linear_velocity.x, this.linear_velocity.y, this.linear_velocity.z );
					collision_events.push( this.angular_velocity.x, this.angular_velocity.y, this.angular_velocity.z );
				}
			);

			body.addListener(
				'contactContinue',
				function( other_body, contact ) {
					collision_events.push( CONTACT_TYPES.CONTINUE, this, other_body, contact );

					// find relative velocities
					collision_events.push( this.linear_velocity.x, this.linear_velocity.y, this.linear_velocity.z );
					collision_events.push( this.angular_velocity.x, this.angular_velocity.y, this.angular_velocity.z );
				}
			);

			body.addListener(
				'contactEnd',
				function( other_body ) {
					collision_events.push( CONTACT_TYPES.END, this, other_body, null );

					// find relative velocities
					collision_events.push( this.linear_velocity.x, this.linear_velocity.y, this.linear_velocity.z );
					collision_events.push( this.angular_velocity.x, this.angular_velocity.y, this.angular_velocity.z );
				}
			);

			world.addRigidBody( body );

			id_body_map[ parameters.body_id ] = body;
			body_id_map[ body.id ] = parameters.body_id;
		}
	);

	handleMessage(
		MESSAGE_TYPES.APPLY_FORCE,
		function( parameters ) {
			var body_id = parameters.body_id;
			var body = id_body_map[ body_id ];
			_tmp_vector3_1.set( parameters.force.x, parameters.force.y, parameters.force.z );
			_tmp_vector3_2.set( parameters.local_location.x, parameters.local_location.y, parameters.local_location.z );
			body.applyForceAtLocalPoint( _tmp_vector3_1, _tmp_vector3_2 );
		}
	);

	handleMessage(
		MESSAGE_TYPES.REMOVE_CONSTRAINT,
		function( parameters ) {
			var constraint_id = parameters.constraint_id;
			var constraint = id_constraint_map[ constraint_id ];
			world.removeConstraint( constraint );
			delete id_constraint_map[ constraint_id ];
		}
	);

	handleMessage(
		MESSAGE_TYPES.REMOVE_GHOSTBODY,
		function( parameters ) {
			var body_id = parameters.body_id;
			var body = id_body_map[ body_id ];
			world.removeGhostBody( body );
			delete id_body_map[ body_id ];
		}
	);
	
	handleMessage(
		MESSAGE_TYPES.REMOVE_RIGIDBODY,
		function( parameters ) {
			var body_id = parameters.body_id;
			var body = id_body_map[ body_id ];
			world.removeRigidBody( body );
			delete id_body_map[ body_id ];
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_CONSTRAINT_ACTIVE,
		function( parameters ) {
			id_constraint_map[ parameters.constraint_id ].active = parameters.active;
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_CONSTRAINT_FACTOR,
		function( parameters ) {
			id_constraint_map[ parameters.constraint_id ].factor = parameters.factor;
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_CONSTRAINT_BREAKING_THRESHOLD,
		function( parameters ) {
			id_constraint_map[ parameters.constraint_id ].breaking_threshold = parameters.breaking_threshold;
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_CONSTRAINT_LIMIT,
		function( parameters ) {
			if ( parameters.enabled === false ) {
				id_constraint_map[ parameters.constraint_id ].limit.set( null, null );
			} else {
				id_constraint_map[ parameters.constraint_id ].limit.set( parameters.lower, parameters.upper );
			}
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_CONSTRAINT_MOTOR,
		function( parameters ) {
			if ( parameters.enabled === false ) {
				id_constraint_map[ parameters.constraint_id ].motor.set( null, null );
			} else {
				id_constraint_map[ parameters.constraint_id ].motor.set( parameters.torque, parameters.max_speed );
			}
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_RIGIDBODY_MASS,
		function( parameters ) {
			id_body_map[ parameters.body_id ].mass = parameters.mass;
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_RIGIDBODY_RESTITUTION,
		function( parameters ) {
			id_body_map[ parameters.body_id ].restitution = parameters.restitution;
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_RIGIDBODY_FRICTION,
		function( parameters ) {
			id_body_map[ parameters.body_id ].friction = parameters.friction;
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_RIGIDBODY_LINEAR_DAMPING,
		function( parameters ) {
			id_body_map[ parameters.body_id ].linear_damping = parameters.damping;
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_RIGIDBODY_ANGULAR_DAMPING,
		function( parameters ) {
			id_body_map[ parameters.body_id ].angular_damping = parameters.damping;
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_RIGIDBODY_COLLISION_GROUPS,
		function( parameters ) {
			id_body_map[ parameters.body_id ].collision_groups = parameters.collision_groups;
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_RIGIDBODY_COLLISION_MASK,
		function( parameters ) {
			id_body_map[ parameters.body_id ].collision_mask = parameters.collision_mask;
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_RIGIDBODY_TRANSFORM,
		function( parameters ) {
			id_body_map[ parameters.body_id ].position.set(
				parameters.position.x,
				parameters.position.y,
				parameters.position.z
			);

			id_body_map[ parameters.body_id ].rotation.set(
				parameters.rotation.x,
				parameters.rotation.y,
				parameters.rotation.z,
				parameters.rotation.w
			);

			id_body_map[ parameters.body_id ].updateDerived();
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_RIGIDBODY_LINEAR_VELOCITY,
		function( parameters ) {
			id_body_map[ parameters.body_id ].linear_velocity.set(
				parameters.velocity.x,
				parameters.velocity.y,
				parameters.velocity.z
			);
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_RIGIDBODY_ANGULAR_VELOCITY,
		function( parameters ) {
			id_body_map[ parameters.body_id ].angular_velocity.set(
				parameters.velocity.x,
				parameters.velocity.y,
				parameters.velocity.z
			);
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_RIGIDBODY_LINEAR_FACTOR,
		function( parameters ) {
			id_body_map[ parameters.body_id ].linear_factor.set(
				parameters.factor.x,
				parameters.factor.y,
				parameters.factor.z
			);
		}
	);

	handleMessage(
		MESSAGE_TYPES.SET_RIGIDBODY_ANGULAR_FACTOR,
		function( parameters ) {
			id_body_map[ parameters.body_id ].angular_factor.set(
				parameters.factor.x,
				parameters.factor.y,
				parameters.factor.z
			);
		}
	);

	handleMessage(
		MESSAGE_TYPES.STEP_SIMULATION,
		function( parameters ) {
			world.step( parameters.time_delta, parameters.max_step );
			reportWorld();
			reportCollisions();
			reportConstraints();
		}
	);

	handleMessage(
		MESSAGE_TYPES.RAYTRACE,
		function( parameters ) {
			var ray_start = new Goblin.Vector3();
			var ray_end = new Goblin.Vector3();
			var results = parameters.rays.map(function( ray ) {
				ray_start.set( ray.start.x, ray.start.y, ray.start.z );
				ray_end.set( ray.end.x, ray.end.y, ray.end.z );
				var intersections = world.rayIntersect( ray_start, ray_end );
				return intersections.map(function(intersection) {
					var mapped_body = body_id_map[ intersection.object.id ];

					// only return an intersection if this body is tracked outside this worker
					if ( mapped_body == null ) {
						return null;
					}

					return {
						body_id: intersection.object.id,
						point: { x: intersection.point.x, y: intersection.point.y, z: intersection.point.z },
						normal: { x: intersection.normal.x, y: intersection.normal.y, z: intersection.normal.z },
					};
				}).filter(function(intersection) {
					return intersection != null;
				});
			});

			postMessage(
				MESSAGE_TYPES.RAYTRACE_RESULTS,
				{
					raytrace_id: parameters.raytrace_id,
					results: results
				}
			);
		}
	);

	handleMessage(
		MESSAGE_TYPES.ADD_CONSTRAINT,
		function( parameters ) {
			var constraint;

			if ( parameters.constraint_type === CONSTRAINT_TYPES.HINGE ) {
				constraint = new Goblin.HingeConstraint(
					id_body_map[ parameters.body_a_id ],
					new Goblin.Vector3( parameters.hinge_axis.x, parameters.hinge_axis.y, parameters.hinge_axis.z ),
					new Goblin.Vector3( parameters.point_a.x, parameters.point_a.y, parameters.point_a.z ),
					parameters.body_b_id == null ? null : id_body_map[parameters.body_b_id],
					parameters.body_b_id == null ? null : new Goblin.Vector3( parameters.point_b.x, parameters.point_b.y, parameters.point_b.z )
				);
			} else if ( parameters.constraint_type === CONSTRAINT_TYPES.POINT ) {
				constraint = new Goblin.PointConstraint(
					id_body_map[ parameters.body_a_id ],
					new Goblin.Vector3( parameters.point_a.x, parameters.point_a.y, parameters.point_a.z ),
					parameters.body_b_id == null ? null : id_body_map[parameters.body_b_id],
					parameters.body_b_id == null ? null : new Goblin.Vector3( parameters.point_b.x, parameters.point_b.y, parameters.point_b.z )
				);
			} else if ( parameters.constraint_type === CONSTRAINT_TYPES.SLIDER ) {
				constraint = new Goblin.SliderConstraint(
					id_body_map[ parameters.body_a_id ],
					new Goblin.Vector3( parameters.axis_a.x, parameters.axis_a.y, parameters.axis_a.z ),
					parameters.body_b_id == null ? null : id_body_map[parameters.body_b_id]
				);
			} else if ( parameters.constraint_type === CONSTRAINT_TYPES.WELD ) {
				constraint = new Goblin.WeldConstraint(
					id_body_map[ parameters.body_a_id ],
					new Goblin.Vector3( parameters.point_a.x, parameters.point_a.y, parameters.point_a.z ),
					parameters.body_b_id == null ? null : id_body_map[parameters.body_b_id],
					parameters.body_b_id == null ? null : new Goblin.Vector3( parameters.point_b.x, parameters.point_b.y, parameters.point_b.z )
				);
			} else {
				// don't add this constraint to the world of the id maps
				return;
			}

			constraint.active = parameters.active;
			constraint.factor = parameters.factor;
			constraint.breaking_threshold = parameters.breaking_threshold;

			if ( parameters.limit && parameters.limit.enabled ) {
				constraint.limit.set( parameters.limit.lower, parameters.limit.upper );
			}

			if ( parameters.motor && parameters.motor.enabled ) {
				constraint.motor.set( parameters.motor.torque, parameters.motor.max_speed );
			}

			id_constraint_map[ parameters.constraint_id ] = constraint;
			constraint_id_map[ constraint.id ] = parameters.constraint_id;
			world.addConstraint( constraint );
		}
	);
})();