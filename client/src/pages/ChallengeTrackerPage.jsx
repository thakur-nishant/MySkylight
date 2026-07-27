import React, { useMemo, useState } from 'react';
import {
  Award,
  CalendarDays,
  CheckCircle2,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Medal,
  Moon,
  PartyPopper,
  Scale,
  Sparkles,
  Trophy,
  Utensils,
} from 'lucide-react';

const defaultParticipants = [
  { id: 'maya', name: 'Maya', color: 'from-fuchsia-500 to-rose-500', text: 'text-fuchsia-700' },
  { id: 'leo', name: 'Leo', color: 'from-sky-500 to-cyan-500', text: 'text-sky-700' },
];

const defaultChallenge = {
  title: 'Couple Challenge Tracker',
  startDate: '2026-07-27',
  endDate: '2026-08-25',
  publishDate: '2026-08-26',
};
const maxDailyPoints = 90;

const defaultGoals = {
  maya: { maxCalories: 1650, workoutMinutes: 30, minSteps: 10000, proteinGrams: 120, waterOz: 80 },
  leo: { maxCalories: 2100, workoutMinutes: 30, minSteps: 10000, proteinGrams: 150, waterOz: 100 },
};

const scoringItems = [
  { key: 'calories', label: 'Calories within max', points: 25, icon: Flame, goalLabel: 'Daily max calories' },
  { key: 'workoutMinutes', label: 'Workout minutes met', points: 20, icon: Dumbbell, goalLabel: 'Workout min minutes' },
  { key: 'steps', label: 'Steps', points: 15, icon: Footprints, goalLabel: 'Step goal reference' },
  { key: 'proteinGrams', label: 'Protein goal met', points: 15, icon: Utensils, goalLabel: 'Protein min grams' },
  { key: 'waterOz', label: 'Water goal met', points: 10, icon: Droplets, goalLabel: 'Water min ounces' },
  { key: 'healthyBonus', label: 'Healthy eating bonus', points: 5, icon: HeartPulse, goalLabel: 'Manual daily bonus' },
];

const wellnessItems = [
  { key: 'sleepHours', label: 'Sleep hours', icon: Moon, helper: 'Shown for awareness only — no points are added.' },
];

function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parseLocalDate(dateString) {
  return new Date(`${dateString}T00:00:00`);
}

function getPublishDateString(endDateString) {
  const nextDay = parseLocalDate(endDateString);
  nextDay.setDate(nextDay.getDate() + 1);
  return nextDay.toISOString().slice(0, 10);
}

function buildChallengeDays(startDateString, endDateString) {
  const days = [];
  const endDate = parseLocalDate(endDateString);
  const cursor = parseLocalDate(startDateString);
  while (cursor <= endDate) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function scoreSteps(steps) {
  if (steps < 8000) return 0;
  if (steps < 10000) return 8;
  return Math.min(15, Math.floor(steps / 1000));
}

function scoreMetric(entry, goals, key) {
  if (key === 'calories') return entry.calories > 0 && entry.calories <= goals.maxCalories ? 25 : 0;
  if (key === 'workoutMinutes') return entry.workoutMinutes >= goals.workoutMinutes ? 20 : 0;
  if (key === 'steps') return scoreSteps(Number(entry.steps) || 0);
  if (key === 'proteinGrams') return entry.proteinGrams >= goals.proteinGrams ? 15 : 0;
  if (key === 'waterOz') return entry.waterOz >= goals.waterOz ? 10 : 0;
  if (key === 'healthyBonus') return entry.healthyBonus ? 5 : 0;
  return 0;
}

function calculateDailyTotal(entry, goals) {
  return scoringItems.reduce((total, item) => total + scoreMetric(entry, goals, item.key), 0);
}

function makeEmptyEntry() {
  return {
    calories: 0,
    workoutMinutes: 0,
    steps: 0,
    proteinGrams: 0,
    waterOz: 0,
    healthyBonus: false,
    sleepHours: 0,
  };
}

function createInitialScores(days) {
  return days.reduce((allScores, day) => {
    const dayKey = day.toISOString().slice(0, 10);
    allScores[dayKey] = {
      maya: makeEmptyEntry(),
      leo: makeEmptyEntry(),
    };
    return allScores;
  }, {});
}

function ProgressBar({ value, max = maxDailyPoints, gradient = 'from-emerald-400 to-teal-500' }) {
  const percent = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-500`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export default function ChallengeTrackerPage() {
  const [challenge, setChallenge] = useState(defaultChallenge);
  const [draftChallenge, setDraftChallenge] = useState(defaultChallenge);
  const [participants, setParticipants] = useState(defaultParticipants);
  const [draftParticipants, setDraftParticipants] = useState(defaultParticipants);
  const [showChallengeForm, setShowChallengeForm] = useState(false);
  const days = useMemo(() => buildChallengeDays(challenge.startDate, challenge.endDate), [challenge.startDate, challenge.endDate]);
  const [goals, setGoals] = useState(defaultGoals);
  const [draftGoals, setDraftGoals] = useState(defaultGoals);
  const [selectedDay, setSelectedDay] = useState(defaultChallenge.startDate);
  const [scores, setScores] = useState(() => createInitialScores(buildChallengeDays(defaultChallenge.startDate, defaultChallenge.endDate)));

  const dailyTotals = participants.map((participant) => ({
    ...participant,
    total: calculateDailyTotal(scores[selectedDay][participant.id], goals[participant.id]),
  }));

  const leaderboard = participants.map((participant) => {
    const total = days.reduce((sum, day) => {
      const dayKey = day.toISOString().slice(0, 10);
      return sum + calculateDailyTotal(scores[dayKey][participant.id], goals[participant.id]);
    }, 0);
    return { ...participant, total, average: Math.round(total / days.length) };
  }).sort((a, b) => b.total - a.total);

  const maxChallengePoints = days.length * maxDailyPoints;
  const powerCoupleDays = days.filter((day) => {
    const key = day.toISOString().slice(0, 10);
    return participants.every((participant) => calculateDailyTotal(scores[key][participant.id], goals[participant.id]) >= 80);
  }).length;

  const weeklySummary = Array.from({ length: Math.ceil(days.length / 7) }, (_, weekIndex) => {
    const weekDays = days.slice(weekIndex * 7, weekIndex * 7 + 7);
    return {
      label: `Week ${weekIndex + 1}`,
      days: weekDays,
      totals: participants.map((participant) => ({
        ...participant,
        total: weekDays.reduce((sum, day) => {
          const dayKey = day.toISOString().slice(0, 10);
          return sum + calculateDailyTotal(scores[dayKey][participant.id], goals[participant.id]);
        }, 0),
      })),
    };
  });

  const updateScore = (participantId, key, value) => {
    setScores((current) => ({
      ...current,
      [selectedDay]: {
        ...current[selectedDay],
        [participantId]: { ...current[selectedDay][participantId], [key]: value },
      },
    }));
  };

  const updateDraftGoal = (participantId, key, value) => {
    setDraftGoals((current) => ({
      ...current,
      [participantId]: { ...current[participantId], [key]: value },
    }));
  };

  const updateDraftParticipant = (participantId, value) => {
    setDraftParticipants((current) => current.map((participant) => (
      participant.id === participantId ? { ...participant, name: value } : participant
    )));
  };

  const saveChallenge = () => {
    const nextDays = buildChallengeDays(draftChallenge.startDate, draftChallenge.endDate);
    setChallenge(draftChallenge);
    setParticipants(draftParticipants);
    setGoals(draftGoals);
    setSelectedDay(draftChallenge.startDate);
    setScores(createInitialScores(nextDays));
    setShowChallengeForm(false);
  };

  const openChallengeForm = () => {
    setDraftChallenge(challenge);
    setDraftParticipants(participants);
    setDraftGoals(goals);
    setShowChallengeForm(true);
  };

  const leader = leaderboard[0];
  const runnerUp = leaderboard[1];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900">
      <div className="bg-[radial-gradient(circle_at_top_left,#38bdf8_0,transparent_35%),radial-gradient(circle_at_top_right,#f472b6_0,transparent_30%),linear-gradient(180deg,#0f172a_0%,#f8fafc_42%)] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 p-6 text-white shadow-2xl backdrop-blur md:p-8">
            <div className="grid gap-8 lg:grid-cols-[1.4fr_.6fr] lg:items-center">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-cyan-100">
                  <Sparkles className="h-4 w-4" /> {challenge.title}
                </div>
                <h1 className="font-display text-4xl font-black leading-tight md:text-6xl">30 days. 2 players. Personalized goals.</h1>
                <p className="mt-4 max-w-2xl text-lg text-slate-200">Set each participant’s daily max calories, water minimum, protein target, and workout goal, then track the habits that keep the challenge fair and motivating.</p>
                <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
                  <span className="rounded-full bg-white px-4 py-2 text-slate-900"><CalendarDays className="mr-2 inline h-4 w-4" />{formatDate(parseLocalDate(challenge.startDate))} – {formatDate(parseLocalDate(challenge.endDate))}</span>
                  <span className="rounded-full bg-amber-300 px-4 py-2 text-amber-950"><PartyPopper className="mr-2 inline h-4 w-4" />Results publish {formatDate(parseLocalDate(challenge.publishDate))}</span>
                  <span className="rounded-full bg-emerald-300 px-4 py-2 text-emerald-950">Sleep is tracked, not scored</span>
                </div>
                <button type="button" onClick={openChallengeForm} className="mt-6 rounded-full bg-white px-5 py-3 font-black text-slate-900 shadow-lg transition hover:-translate-y-0.5">Edit Challenge</button>
              </div>
              <div className="rounded-3xl bg-white p-5 text-slate-900 shadow-xl">
                <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-500">Current leader</span><Trophy className="h-7 w-7 text-amber-500" /></div>
                <h2 className="mt-3 text-3xl font-black">{leader.name}</h2>
                <p className="text-slate-500">Ahead by {Math.abs(leader.total - runnerUp.total)} points</p>
                <ProgressBar value={leader.total} max={maxChallengePoints} gradient={leader.color} />
                <p className="mt-3 text-sm font-semibold text-slate-600">{leader.total} / {maxChallengePoints} scored habit points</p>
              </div>
            </div>
          </section>

          {showChallengeForm && (
          <section className="rounded-3xl bg-white p-5 shadow-lg">
            <h2 className="mb-2 text-xl font-black">Challenge creation form</h2>
            <p className="mb-4 text-sm text-slate-500">Edit participant names, challenge dates, and personalized daily targets. Saving resets daily entries to 0 for the selected date range.</p>
            <div className="mb-4 grid gap-3 md:grid-cols-3"><label className="block rounded-2xl bg-slate-50 p-3"><span className="mb-2 block text-sm font-bold text-slate-600">Challenge title</span><input value={draftChallenge.title} onChange={(event) => setDraftChallenge((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-semibold" /></label><label className="block rounded-2xl bg-slate-50 p-3"><span className="mb-2 block text-sm font-bold text-slate-600">Start date</span><input type="date" value={draftChallenge.startDate} onChange={(event) => setDraftChallenge((current) => ({ ...current, startDate: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-semibold" /></label><label className="block rounded-2xl bg-slate-50 p-3"><span className="mb-2 block text-sm font-bold text-slate-600">End date</span><input type="date" value={draftChallenge.endDate} onChange={(event) => setDraftChallenge((current) => ({ ...current, endDate: event.target.value, publishDate: getPublishDateString(event.target.value) }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-semibold" /></label></div>
            <div className="grid gap-4 md:grid-cols-2">
              {draftParticipants.map((participant) => (
                <div key={participant.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <label className="mb-4 block"><span className="mb-2 block text-sm font-bold text-slate-600">Participant name</span><input value={participant.name} onChange={(event) => updateDraftParticipant(participant.id, event.target.value)} className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-2xl font-black ${participant.text}`} /></label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {scoringItems.filter((item) => item.key !== 'healthyBonus').map((item) => (
                      <label key={item.key} className="block rounded-2xl bg-white p-3 shadow-sm">
                        <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-600"><item.icon className="h-4 w-4" />{item.goalLabel}</span>
                        <input
                          type="number"
                          min="0"
                          value={draftGoals[participant.id][item.key === 'calories' ? 'maxCalories' : item.key]}
                          onChange={(event) => updateDraftGoal(participant.id, item.key === 'calories' ? 'maxCalories' : item.key, Number(event.target.value))}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 font-semibold"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={saveChallenge} className="rounded-2xl bg-slate-900 px-5 py-3 font-black text-white">Save challenge</button><button type="button" onClick={() => setShowChallengeForm(false)} className="rounded-2xl border border-slate-200 px-5 py-3 font-black text-slate-700">Cancel</button></div>
          </section>
          )}

          <section className="grid gap-4 lg:grid-cols-7">
            <div className="rounded-3xl bg-white p-5 shadow-lg lg:col-span-2">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-black"><Scale className="h-5 w-5 text-emerald-500" /> Scoring works</h2>
              <div className="space-y-3">
                {scoringItems.map(({ key, label, points, icon: Icon }) => <div key={key} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3"><span className="flex items-center gap-2 font-medium"><Icon className="h-4 w-4 text-slate-500" />{label}</span><b>{points}</b></div>)}
                {wellnessItems.map(({ key, label, icon: Icon }) => <div key={key} className="flex items-center justify-between rounded-2xl bg-indigo-50 p-3 text-indigo-800"><span className="flex items-center gap-2 font-medium"><Icon className="h-4 w-4" />{label}</span><b>0</b></div>)}
              </div>
              <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">Scored habits total {maxDailyPoints} points. Sleep stays visible as a wellness metric but does not affect the competition score.</p>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-lg lg:col-span-5">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-xl font-black">Daily score tracker</h2><p className="text-sm text-slate-500">Pick a day, then enter each participant’s actual calories, water, protein, steps, workout, and sleep.</p></div>
                <select value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold shadow-sm">
                  {days.map((day) => <option key={day.toISOString()} value={day.toISOString().slice(0, 10)}>{day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</option>)}
                </select>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {participants.map((participant) => {
                  const entry = scores[selectedDay][participant.id];
                  const participantGoals = goals[participant.id];
                  const total = calculateDailyTotal(entry, participantGoals);
                  return <div key={participant.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <div className="mb-4 flex items-center justify-between"><h3 className={`text-2xl font-black ${participant.text}`}>{participant.name}</h3><span className="rounded-full bg-white px-3 py-1 text-lg font-black shadow-sm">{total}/{maxDailyPoints}</span></div>
                    <ProgressBar value={total} gradient={participant.color} />
                    <div className="mt-4 space-y-3">
                      <label className="block rounded-2xl bg-white p-3 shadow-sm"><span className="mb-2 flex items-center justify-between text-sm font-bold"><span className="flex items-center gap-2"><Flame className="h-4 w-4" />Calories eaten <em className="font-semibold not-italic text-slate-500">(goal ≤ {participantGoals.maxCalories})</em></span><span>{scoreMetric(entry, participantGoals, 'calories')} pts</span></span><input type="number" min="0" value={entry.calories} onChange={(e) => updateScore(participant.id, 'calories', Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2" /><p className="mt-1 text-xs text-slate-500">Goal: at or under {participantGoals.maxCalories} calories.</p></label>
                      <label className="block rounded-2xl bg-white p-3 shadow-sm"><span className="mb-2 flex items-center justify-between text-sm font-bold"><span className="flex items-center gap-2"><Dumbbell className="h-4 w-4" />Workout minutes <em className="font-semibold not-italic text-slate-500">(goal ≥ {participantGoals.workoutMinutes})</em></span><span>{scoreMetric(entry, participantGoals, 'workoutMinutes')} pts</span></span><input type="number" min="0" value={entry.workoutMinutes} onChange={(e) => updateScore(participant.id, 'workoutMinutes', Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
                      <label className="block rounded-2xl bg-white p-3 shadow-sm"><span className="mb-2 flex items-center justify-between text-sm font-bold"><span className="flex items-center gap-2"><Footprints className="h-4 w-4" />Steps <em className="font-semibold not-italic text-slate-500">(goal {participantGoals.minSteps.toLocaleString()})</em></span><span>{scoreSteps(entry.steps)} pts</span></span><input type="number" min="0" step="500" value={entry.steps} onChange={(e) => updateScore(participant.id, 'steps', Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2" /><p className="mt-1 text-xs text-slate-500">Under 8k = 0, 8–9.9k = 8, then rounded down by 1k up to 15.</p></label>
                      <label className="block rounded-2xl bg-white p-3 shadow-sm"><span className="mb-2 flex items-center justify-between text-sm font-bold"><span className="flex items-center gap-2"><Utensils className="h-4 w-4" />Protein grams <em className="font-semibold not-italic text-slate-500">(goal ≥ {participantGoals.proteinGrams}g)</em></span><span>{scoreMetric(entry, participantGoals, 'proteinGrams')} pts</span></span><input type="number" min="0" value={entry.proteinGrams} onChange={(e) => updateScore(participant.id, 'proteinGrams', Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
                      <label className="block rounded-2xl bg-white p-3 shadow-sm"><span className="mb-2 flex items-center justify-between text-sm font-bold"><span className="flex items-center gap-2"><Droplets className="h-4 w-4" />Water ounces <em className="font-semibold not-italic text-slate-500">(goal ≥ {participantGoals.waterOz} oz)</em></span><span>{scoreMetric(entry, participantGoals, 'waterOz')} pts</span></span><input type="number" min="0" value={entry.waterOz} onChange={(e) => updateScore(participant.id, 'waterOz', Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
                      <label className="block rounded-2xl bg-indigo-50 p-3 shadow-sm"><span className="mb-2 flex items-center justify-between text-sm font-bold text-indigo-800"><span className="flex items-center gap-2"><Moon className="h-4 w-4" />Sleep hours <em className="font-semibold not-italic text-indigo-600">(wellness only)</em></span><span>0 pts</span></span><input type="number" min="0" step="0.1" value={entry.sleepHours} onChange={(e) => updateScore(participant.id, 'sleepHours', Number(e.target.value))} className="w-full rounded-xl border border-indigo-100 px-3 py-2" /><p className="mt-1 text-xs text-indigo-700">Shown for wellness context only; no score impact.</p></label>
                      <label className="flex cursor-pointer items-center justify-between rounded-2xl bg-white p-3 shadow-sm transition hover:-translate-y-0.5"><span className="flex items-center gap-2 font-medium"><HeartPulse className="h-4 w-4 text-slate-500" />Healthy eating bonus</span><input type="checkbox" checked={entry.healthyBonus} onChange={(e) => updateScore(participant.id, 'healthyBonus', e.target.checked)} className="h-5 w-5 rounded text-sky-600" /></label>
                    </div>
                  </div>;
                })}
              </div>
              {dailyTotals.every((player) => player.total >= 80) && <div className="mt-4 rounded-3xl bg-gradient-to-r from-amber-200 to-pink-200 p-4 font-black text-amber-950 animate-pulse"><PartyPopper className="mr-2 inline h-5 w-5" />Power Couple Bonus unlocked today: both scored 80+ scored habit points!</div>}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl bg-white p-5 shadow-lg">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-black"><Medal className="h-5 w-5 text-amber-500" /> Running leaderboard</h2>
              <div className="space-y-4">{leaderboard.map((player, index) => <div key={player.id} className="rounded-2xl bg-slate-50 p-4"><div className="mb-2 flex justify-between"><b>#{index + 1} {player.name}</b><b>{player.total}</b></div><ProgressBar value={player.total} max={maxChallengePoints} gradient={player.color} /><p className="mt-2 text-sm text-slate-500">Daily average: {player.average}/{maxDailyPoints}</p></div>)}</div>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-lg lg:col-span-2">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-black"><Award className="h-5 w-5 text-violet-500" /> Weekly summary</h2>
              <div className="grid gap-3 sm:grid-cols-2">{weeklySummary.map((week) => <div key={week.label} className="rounded-2xl border border-slate-100 p-4"><div className="mb-3 flex items-center justify-between"><b>{week.label}</b><span className="text-sm text-slate-500">{formatDate(week.days[0])}–{formatDate(week.days[week.days.length - 1])}</span></div>{week.totals.map((player) => <div key={player.id} className="mb-3 last:mb-0"><div className="mb-1 flex justify-between text-sm font-semibold"><span>{player.name}</span><span>{player.total}</span></div><ProgressBar value={player.total} max={week.days.length * maxDailyPoints} gradient={player.color} /></div>)}</div>)}</div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl bg-gradient-to-br from-amber-300 to-orange-400 p-6 text-amber-950 shadow-lg lg:col-span-2">
              <h2 className="flex items-center gap-2 text-2xl font-black"><Trophy className="h-7 w-7" /> Final winner section</h2>
              <p className="mt-2 text-lg font-semibold">If the challenge ended today, {leader.name} would take the crown. Official results auto-publish on {formatDate(parseLocalDate(challenge.publishDate))}.</p>
              <div className="mt-4 rounded-2xl bg-white/55 p-4 font-bold">Power Couple Bonus days so far: {powerCoupleDays}</div>
            </div>
            <div className="rounded-3xl bg-white p-6 shadow-lg">
              <h2 className="flex items-center gap-2 text-xl font-black"><CheckCircle2 className="h-5 w-5 text-emerald-500" /> Friendly rules</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>• Set goals before the challenge starts.</li>
                <li>• Sleep is tracked for health, not points.</li>
                <li>• Keep workouts safe and sustainable.</li>
                <li>• Winner chooses a healthy celebration date.</li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
