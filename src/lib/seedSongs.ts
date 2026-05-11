export interface RawSong {
  id: string;
  title: string;
  artist: string;
  originalKey?: string;
  source: string;
}

export const SEED_SONGS: RawSong[] = [
  {
    id: 'demo-wonderwall',
    title: 'Wonderwall',
    artist: 'Oasis',
    originalKey: 'Em',
    source: `[Verse 1]
[Em7]Today is gonna be the day that they're [G]gonna throw it back to [D]you
[Em7]By now you should've somehow rea[G]lized what you gotta [D]do
[Em7]I don't believe that [G]anybody [D]feels the way I [Am7]do about you [C]now [D]

[Verse 2]
[Em7]Backbeat the word is on the [G]street that the fire in your [D]heart is out
[Em7]I'm sure you've heard it [G]all before but you [D]never really had a [Am7]doubt

[Pre-Chorus]
[C]And all the roads we [D]have to walk are [Em7]winding
[C]And all the lights that [D]lead us there are [Em7]blinding

[Chorus]
[C]Because [D]maybe [Em7]you're gonna be the one that [G]saves me
[C]And [D]after [Em7]all you're my [G]wonderwall`,
  },
  {
    id: 'demo-knockin',
    title: "Knockin' on Heaven's Door",
    artist: 'Bob Dylan',
    originalKey: 'G',
    source: `[Verse 1]
G               D                 Am
Mama, take this badge off of me
G                D            C
I can't use it anymore
G              D              Am
It's gettin' dark, too dark to see
G            D              C
Feel I'm knockin' on heaven's door

[Chorus]
G            D              Am
Knock, knock, knockin' on heaven's door
G            D              C
Knock, knock, knockin' on heaven's door

[Verse 2]
G                  D              Am
Mama, put my guns in the ground
G              D                C
I can't shoot them anymore
G                D                  Am
That long black cloud is comin' down
G            D              C
Feel I'm knockin' on heaven's door`,
  },
  {
    id: 'demo-nothing-else-matters',
    title: 'Nothing Else Matters',
    artist: 'Metallica',
    originalKey: 'Em',
    source: `[Intro tab]
e|--0-----0-----0-----0-----|
B|--0-----0-----0-----0-----|
G|--0-----0-----0-----0-----|
D|--2-----2-----2-----2-----|
A|--2-----2-----2-----2-----|
E|--0-----0-----0-----0-----|

[Intro]
Em   D   C   D
Em   D   C   D

[Verse 1]
Em               D            C
So close, no matter how far
              D              Em
Couldn't be much more from the heart
            D                C
Forever trusting who we are
       D       Em
And nothing else matters

[Verse 2]
[Em]Never opened myself this [D]way
[C]Life is ours, we live it our [D]way
[Em]All these words I don't just [D]say
[C]And nothing else [D]matters

[Bridge]
Am               Em
Trust I seek and I find in you
Am             Em
Every day for us, something new
Am             B7
Open mind for a different view
            Em      D    C    D
And nothing else matters`,
  },
];
