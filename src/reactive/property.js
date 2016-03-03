import baseStreams from "../inc/base-streams"

export function Property(value){
    var stream = baseStreams.bus(); 
    var value;
    var property = stream.scan(0, (state, _) => value = _(state), value)
    property.onValue(_=>_);
    return {
        swap: _ => stream.push(_),
        then: _ => property.onValue(_),
        unwrap: _ => value,
        stream: property
    };
}


