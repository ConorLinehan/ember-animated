import Ember from 'ember';
import { task } from 'ember-concurrency';
import { microwait, rAF } from '../concurrency-helpers';

export default Ember.Service.extend({
  init() {
    this._super();
    this._rendezvous = [];
    this._animators = Ember.A();
  },
  register(animator) {
    this._animators.pushObject(animator);
  },
  unregister(animator) {
    this._animators.removeObject(animator);
  },

  // This is a publicly visible property you can use to know if any
  // animations are running. It's timing is deliberately not
  // synchronous, so that you can bind it into a template without
  // getting double-render errors.
  isAnimating: Ember.computed(function () {
    return this.get('isAnimatingSync');
  }),

  // Synchronously updated version of isAnimating. If you try to
  // depend on this in a template you will get double-render errors
  // (because the act of rendering can cause animations to begin).
  isAnimatingSync: Ember.computed('_animators.@each.isAnimating', function() {
    return this.get('_animators').any(animator => animator.get('isAnimating'));
  }),

  // Invalidation support for isAnimating
  _invalidateIsAnimating: task(function * () {
    yield rAF();
    this.propertyDidChange('isAnimating');
  }).observes('isAnimatingSync'),

  waitUntilIdle: task(function * () {
    // we are idle if we experience two frames in a row with nothing
    // animating.
    while (true) {
      yield rAF();
      if (!this.get('isAnimatingSync')) {
        yield rAF();
        if (!this.get('isAnimatingSync')) {
          return;
        }
      }
    }
  }),

  farMatch: task(function * (inserted, removed, replaced) {
    let mine = { inserted, removed, replaced };
    this._rendezvous.push(mine);
    yield microwait();
    if (this.get('farMatch.concurrency') > 1) {
      this._rendezvous.forEach(target => {
        if (target === mine) { return; }
        performMatches(mine, target);
        performMatches(target, mine);
      });
    }
    this._rendezvous.splice(this._rendezvous.indexOf(mine));
    return [inserted, removed, replaced];
  })
});

function performMatches(insertedSource, removedSource) {
  insertedSource.inserted.slice().forEach(entry => {
    let match = removedSource.removed.find(myEntry => entry.item.id === myEntry.item.id);
    if (match) {
      removedSource.removed.splice(removedSource.removed.indexOf(match), 1);
      insertedSource.inserted.splice(insertedSource.inserted.indexOf(entry), 1);
      insertedSource.replaced.push([match, entry]);
    }
  });

}
