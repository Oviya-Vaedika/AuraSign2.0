
/*
  AURA SIGN — Learning Dictionary

  IMPORTANT:
  These are educational phrase entries, not verified ISL translations.
  Do not treat avatar animations as actual sign-language demonstrations.

  Keep the existing label, symbol, description, and pose fields because
  translator.js currently depends on them.
*/

(() => {
  "use strict";

  const phrases = {
    "HELLO": {
      label: "Hello",
      symbol: "✋",
      description: "A greeting. Verify the correct ISL sign before teaching it.",
      pose: "wave",
      category: "greetings",
      language: "ISL",
      entryType: "phrase",
      verification: "unverified"
    },

    "THANK YOU": {
      label: "Thank you",
      symbol: "♡",
      description: "A polite expression. ISL reference needed.",
      pose: "thank",
      category: "politeness",
      language: "ISL",
      entryType: "phrase",
      verification: "unverified"
    },

    "HELP": {
      label: "Help",
      symbol: "＋",
      description: "A request for assistance. ISL reference needed.",
      pose: "help",
      category: "everyday",
      language: "ISL",
      entryType: "word",
      verification: "unverified"
    },

    "PLEASE": {
      label: "Please",
      symbol: "✦",
      description: "A polite request. ISL reference needed.",
      pose: "please",
      category: "politeness",
      language: "ISL",
      entryType: "word",
      verification: "unverified"
    },

    "SORRY": {
      label: "Sorry",
      symbol: "↻",
      description: "An apology. ISL reference needed.",
      pose: "sorry",
      category: "politeness",
      language: "ISL",
      entryType: "word",
      verification: "unverified"
    },

    "I LOVE YOU": {
      label: "I love you",
      symbol: "♡",
      description: "An affectionate expression. ISL reference needed.",
      pose: "love",
      category: "everyday",
      language: "ISL",
      entryType: "phrase",
      verification: "unverified"
    },

    "YES": {
      label: "Yes",
      symbol: "✓",
      description: "An affirmative response. ISL reference needed.",
      pose: "yes",
      category: "everyday",
      language: "ISL",
      entryType: "word",
      verification: "unverified"
    },

    "NO": {
      label: "No",
      symbol: "×",
      description: "A negative response. ISL reference needed.",
      pose: "no",
      category: "everyday",
      language: "ISL",
      entryType: "word",
      verification: "unverified"
    },

    "GOOD MORNING": {
      label: "Good morning",
      symbol: "☼",
      description: "A morning greeting. ISL reference needed.",
      pose: "morning",
      category: "greetings",
      language: "ISL",
      entryType: "phrase",
      verification: "unverified"
    },

    "GOODBYE": {
      label: "Goodbye",
      symbol: "↗",
      description: "A farewell. ISL reference needed.",
      pose: "goodbye",
      category: "greetings",
      language: "ISL",
      entryType: "word",
      verification: "unverified"
    },

    "HOW ARE YOU": {
      label: "How are you?",
      symbol: "?",
      description: "A conversational question. ISL reference needed.",
      pose: "question",
      category: "questions",
      language: "ISL",
      entryType: "phrase",
      verification: "unverified"
    },

    "WELCOME": {
      label: "Welcome",
      symbol: "✳",
      description: "A welcoming expression. ISL reference needed.",
      pose: "welcome",
      category: "greetings",
      language: "ISL",
      entryType: "word",
      verification: "unverified"
    }
  };

  /*
    Fingerspelling is kept separate from vocabulary.
    Add an alphabet entry only after its ISL handshape and
    reference material have been verified.
  */
  const alphabet = {
    language: "ISL",
    entryType: "fingerspelling",
    verification: "not_yet_populated",
    letters: []
  };

  /*
    Backward compatibility:
    translator.js and the dictionary page continue using this object.
  */
  window.AuraDictionary = phrases;

  /*
    New structured data for future features:
    alphabet learning, filters, verified references, and model labels.
  */
  window.AuraDictionaryData = {
    language: "ISL",
    displayName: "Indian Sign Language",
    phrases,
    alphabet,
    verificationGuide: {
      unverified: "Needs review against a reliable ISL reference.",
      verified: "Checked against a reliable ISL reference.",
      modelTested: "Recognition performance evaluated using labelled data."
    }
  };
})();
