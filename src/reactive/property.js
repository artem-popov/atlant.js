import baseStreams from "../inc/base-streams"

export function Property(initialValue){
    var stream = baseStreams.bus(); 
    var value = initialValue();
    var name = void 0;
    var property = stream.scan(value, (state, _) => (value = _(state), value))
    property.onValue(_=>_);
    return {
        swap: _ => (stream.push(_), this),
        then: _ => (property.onValue(_), this),
        name(_){ if(_) name = _; return _ ? this : name },
        unwrap: _ => value,
        stream: property,
    };
}


