// @flow

import baseStreams from '../inc/base-streams';
import s from '../utils/lib';


// Use this to get early callback for server render
export function onRenderEnd(callback : Function): Function {
  return baseStreams.onValue(this.devStreams.renderEndStream, s.baconTryD(callback));
}

// Use this when you want catch atlant destroy
export function onDestroy(callback : Function): Function { // Use this to get early callback for server render
  return baseStreams.onValue(this.devStreams.onDestroyStream, s.baconTryD(callback));
}


export function onUpdate(actionName, callback) {
  if (!(actionName in this.callbacks.onUpdate)) this.callbacks.onUpdate[actionName] = [];

  const index = this.callbacks.onUpdate[actionName].push(callback);

  return () => splice(this.callbacks.onUpdate[actionName], 1);
}

