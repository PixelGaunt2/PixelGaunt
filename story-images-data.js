// Scene artwork for the current story - one entry per STORY_SCENES key's `image` field (see
// STORY_SCENES in game.js). Every key here is loaded once by the story engine's preloader and
// then swapped in instantly as each scene begins, so there's no load-stutter mid-dialogue.
const STORY_IMAGES = {
  TITLE:            "story-title.jpg",
  SCENE1_COLLAPSE:   "story-scene1-collapse.jpg",
  SCENE2_DISCOVERY:  "story-scene2-discovery.jpg",
  SCENE3_LASTPILOT:  "story-scene3-lastpilot.jpg",
  SCENE4_BELT:       "story-scene4-belt.jpg",
  SCENE5_SHIPMENT:   "story-scene5-shipment.jpg",
  SCENE6_DRILL:      "story-scene6-drillupgrade.jpg",
  SUIT_UNLOCK:       "story-suitunlock.jpg",
  FIREBALL_UNLOCK:   "story-fireballunlock.jpg",
  ANTIQUE_RELIC:     "story-antiquerelic.jpg",
  DRAGON_SKULL:      "story-dragonskull.jpg",
  BLACK_HOLE:        "story-blackhole.jpg",
  FINAL:             "story-final.jpg"
};
