export default {
    /**
     * constraint_type String type of constraint
     * constraint_id Number id of the constraint
     * body_a_id Number id of body_a
     * hinge_axis Object axis in body_a the hinge revolves around {x:x, y:y, z:z}
     * point_a Object point in body_a the hinge revolves around {x:x, y:y, z:z}
     * body_b_id [optional] Number id of body_b
     * point_b [optional] Object point in body_b the hinge revolves around {x:x, y:y, z:z}
     * active Boolean whether or not the constraint is enabled
     * factor: Number factor applied to constraint, 0-1
     * breaking_threshold: Number amount of force which, if exceeded, de-activates the constraint
     * limit.enabled Boolean whether or not the limits are set
     * limit.lower Number lower bound of limit
     * limit.upper Number upper bound of limit
     * motor.enabled Boolean whether or not the motor is on
     * motor.torque Number maximum torque the motor can apply
     * motor.max_speed Number maximum speed the motor can reach under its own power
     */
    HINGE: 'HINGE'
}