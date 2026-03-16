// Run this in browser console on pinitworld.vercel.app
// It seeds 500 test notes across countries (run multiple times for more)

const SUPABASE_URL = 'https://udzxqigctbrpandqmzev.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkenhxaWdjdGJycGFuZHFtemV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NjQ1NzMsImV4cCI6MjA4OTE0MDU3M30.ZR5L_90-ztWz_D-gVbSIwQFEnrqa3XDBZCmRjzB5EEs';

const countries = ["Pakistan","India","United States","United Kingdom","Brazil","Germany","France","Japan","China","Australia","Canada","Russia","Turkey","Egypt","Nigeria","South Africa","Indonesia","Mexico","Argentina","Bangladesh","Iran","Saudi Arabia","UAE","Malaysia","Philippines","Vietnam","Thailand","South Korea","Italy","Spain","Poland","Ukraine","Netherlands","Sweden","Norway","Denmark","Finland","Switzerland","Austria","Belgium","Portugal","Greece","Czech Republic","Romania","Hungary","Kazakhstan","Uzbekistan","Afghanistan","Nepal","Sri Lanka","Singapore","New Zealand","Kenya","Ghana","Ethiopia","Tanzania","Morocco","Algeria","Tunisia","Libya","Jordan","Lebanon","Syria","Iraq","Kuwait","Qatar","Oman","Yemen","Senegal","Somalia","Uganda","Zimbabwe","Mozambique","Angola","Colombia","Venezuela","Peru","Chile","Bolivia","Paraguay","Uruguay","Ecuador","Guatemala","Honduras","Nicaragua","El Salvador","Panama","Cuba","Dominican Republic","Jamaica","Georgia","Armenia","Azerbaijan","Belarus","Serbia","Croatia","Bulgaria","Albania"];

const notes = [
  "I hope my children inherit a kinder world than the one I found.",
  "Somewhere out there, someone is thinking exactly what I am thinking right now.",
  "The best moments of my life happened when I forgot to check my phone.",
  "I never told my father I loved him. I should have.",
  "Every morning I wake up and choose to try again.",
  "The ocean does not care about your problems. That is why I love it.",
  "I left everything behind to start over. It was the best decision I ever made.",
  "My grandmother taught me that bread and kindness are never wasted.",
  "I have survived everything that was supposed to break me.",
  "If you are reading this, I hope today is gentle with you.",
  "We are all just trying to make it home.",
  "I spent years chasing happiness before I realized it was already here.",
  "The night sky looks the same from every country. Remember that.",
  "Regret is a heavier thing to carry than failure.",
  "My city is loud but my heart is quiet.",
  "I fell in love in a language I barely spoke.",
  "There is a version of me that gave up. I am glad it was not this one.",
  "The river near my village smells like my entire childhood.",
  "I want to see the sunrise from every mountain I have not yet climbed.",
  "To whoever finds this — you are not alone.",
  "My mother's hands were the safest place I have ever been.",
  "I believe in small acts of courage done quietly every day.",
  "We do not remember days, we remember moments.",
  "I forgave someone today. It felt like putting down something very heavy.",
  "The world is too beautiful to spend it angry.",
  "Sometimes I think the stars are just holes in the darkness.",
  "I have been lost more times than I can count. I always found my way back.",
  "One day this will all make sense. Until then, I keep going.",
  "My greatest achievement is still loving people who are hard to love.",
  "I planted a tree I will never sit under. That is enough.",
];

const colors = ['#fef08a','#fde68a','#86efac','#93c5fd','#a5b4fc','#f9a8d4','#fca5a5','#fdba74','#d9f99d','#ffffff'];
const aliases = ["Amara","Kenji","Sofia","Omar","Priya","Luca","Fatima","Noah","Yuki","Carlos","Aisha","Dmitri","Maria","Hassan","Lin","James","Nadia","Ravi","Elena","Kwame","Zara","Miguel","Ana","Ibrahim","Mei","Pierre","Aditi","Samuel","Leila","Tomas"];

async function seed(count = 500) {
  const { createClient } = supabase;
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const batch = [];
  for (let i = 0; i < count; i++) {
    const country = countries[Math.floor(Math.random() * countries.length)];
    const note = notes[Math.floor(Math.random() * notes.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const alias = aliases[Math.floor(Math.random() * aliases.length)];
    const ip_hash = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    batch.push({ content: note, alias, color, country, ip_hash });
  }
  const { error } = await sb.from('notes').insert(batch);
  if (error) { console.error('Error:', error); return; }
  console.log(`Seeded ${count} notes successfully.`);
}

seed(500);
