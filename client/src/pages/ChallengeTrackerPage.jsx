import React, { useEffect, useMemo, useState } from 'react';
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
import { challengeTracker } from '../api';

const defaultParticipants = [
  { id: 'demo@myskylight.app', email: 'demo@myskylight.app', name: 'Demo User', color: 'from-fuchsia-500 to-rose-500', text: 'text-fuchsia-700' },
  { id: 'family@myskylight.app', email: 'family@myskylight.app', name: 'Family Member', color: 'from-sky-500 to-cyan-500', text: 'text-sky-700' },
];

const defaultChallenge = {
  title: 'Couple Challenge Tracker',
  startDate: '2026-07-27',
  endDate: '2026-08-25',
  publishDate: '2026-08-26',
};
const defaultMetrics = [
  { key: 'calories', label: 'Calories eaten', unit: 'calories', inputType: 'number', scoringType: 'atMost', points: 25 },
  { key: 'workoutMinutes', label: 'Workout minutes', unit: 'minutes', inputType: 'number', scoringType: 'atLeast', points: 20 },
  { key: 'steps', label: 'Steps', unit: 'steps', inputType: 'number', scoringType: 'steps', points: 15 },
  { key: 'proteinGrams', label: 'Protein grams', unit: 'g', inputType: 'number', scoringType: 'atLeast', points: 15 },
  { key: 'waterLiters', label: 'Water liters', unit: 'L', inputType: 'number', scoringType: 'atLeast', points: 10 },
  { key: 'sleepHours', label: 'Sleep hours', unit: 'hours', inputType: 'number', scoringType: 'none', points: 0 },
  { key: 'healthyBonus', label: 'Healthy eating bonus', unit: '', inputType: 'checkbox', scoringType: 'checkbox', points: 5 },
];
const defaultGoals = {
  'demo@myskylight.app': { maxCalories: 1650, workoutMinutes: 30, minSteps: 10000, proteinGrams: 120, waterLiters: 2.4 },
  'family@myskylight.app': { maxCalories: 2100, workoutMinutes: 30, minSteps: 10000, proteinGrams: 150, waterLiters: 3 },
};

const metricIcons = {
  calories: Flame,
  workoutMinutes: Dumbbell,
  steps: Footprints,
  proteinGrams: Utensils,
  waterLiters: Droplets,
  healthyBonus: HeartPulse,
  sleepHours: Moon,
};

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

function formatDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function goalFieldKey(metricKey) {
  if (metricKey === 'calories') return 'maxCalories';
  if (metricKey === 'steps') return 'minSteps';
  return metricKey;
}

function scoreMetric(entry, goals, metric) {
  const value = entry[metric.key];
  const goal = Number(goals?.[goalFieldKey(metric.key)]) || 0;
  const points = Number(metric.points) || 0;
  if (metric.scoringType === 'none') return 0;
  if (metric.scoringType === 'checkbox') return value ? points : 0;
  const numberValue = Number(value) || 0;
  if (metric.scoringType === 'atMost') return numberValue > 0 && numberValue <= goal ? points : 0;
  if (metric.scoringType === 'steps') {
    if (numberValue < 8000) return 0;
    return Math.min(points, Math.floor(numberValue / 1000));
  }
  return numberValue > 0 && numberValue >= goal ? points : 0;
}

function calculateDailyTotal(entry, goals, metrics) {
  return metrics.reduce((total, metric) => total + scoreMetric(entry, goals, metric), 0);
}

function makeEmptyEntry(metrics = defaultMetrics) {
  return metrics.reduce((entry, metric) => {
    entry[metric.key] = metric.inputType === 'checkbox' ? false : 0;
    return entry;
  }, {});
}

function createInitialScores(days, participantIds, metrics = defaultMetrics) {
  const ids = participantIds?.length ? participantIds : defaultParticipants.map((p) => p.id);
  return days.reduce((allScores, day) => {
    const dayKey = formatDayKey(day);
    allScores[dayKey] = ids.reduce((entries, participantId) => {
      entries[participantId] = makeEmptyEntry(metrics);
      return entries;
    }, {});
    return allScores;
  }, {});
}

function mergeScoresForDays(currentScores, days, participantIds, metrics = defaultMetrics) {
  const merged = { ...currentScores };
  for (const day of days) {
    const dayKey = formatDayKey(day);
    merged[dayKey] = { ...(merged[dayKey] || {}) };
    for (const participantId of participantIds) {
      merged[dayKey][participantId] = { ...makeEmptyEntry(metrics), ...(merged[dayKey][participantId] || {}) };
    }
  }
  return merged;
}

function ProgressBar({ value, max, gradient = 'from-emerald-400 to-teal-500' }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-500`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export default function ChallengeTrackerPage() {
  const [challenge, setChallenge] = useState(defaultChallenge);
  const [challengeId, setChallengeId] = useState(null);
  const [challengeList, setChallengeList] = useState({ active: [], past: [] });
  const [selectedChallengeId, setSelectedChallengeId] = useState(null);
  const [draftChallenge, setDraftChallenge] = useState(defaultChallenge);
  const [metrics, setMetrics] = useState(defaultMetrics);
  const [draftMetrics, setDraftMetrics] = useState(defaultMetrics);
  const [participants, setParticipants] = useState(defaultParticipants);
  const [draftParticipants, setDraftParticipants] = useState(defaultParticipants);
  const [showChallengeForm, setShowChallengeForm] = useState(false);
  const days = useMemo(() => buildChallengeDays(challenge.startDate, challenge.endDate), [challenge.startDate, challenge.endDate]);
  const [goals, setGoals] = useState(defaultGoals);
  const [draftGoals, setDraftGoals] = useState(defaultGoals);
  const [selectedDay, setSelectedDay] = useState(defaultChallenge.startDate);
  const [scores, setScores] = useState(() => createInitialScores(
    buildChallengeDays(defaultChallenge.startDate, defaultChallenge.endDate),
    defaultParticipants.map((p) => p.id),
  ));
  const maxDailyPoints = metrics.reduce(
    (total, metric) => total + (metric.scoringType === 'none' ? 0 : Number(metric.points) || 0),
    0,
  );
  const powerCoupleThreshold = Math.min(80, maxDailyPoints);

  const applyChallengeState = (state) => {
    if (!state || !state.challenge) return;

    const participantIds = state.participants.map((participant) => participant.id);
    const challengeDays = buildChallengeDays(state.challenge.startDate, state.challenge.endDate);
    const loadedMetrics = Array.isArray(state.challenge.metrics) ? state.challenge.metrics : defaultMetrics;

    setChallenge(state.challenge);
    setChallengeId(state.challengeId ?? state.challenge.id ?? null);
    setDraftChallenge(state.challenge);
    setMetrics(loadedMetrics);
    setDraftMetrics(loadedMetrics);
    setParticipants(state.participants);
    setDraftParticipants(state.participants);
    setGoals(state.goals);
    setDraftGoals(state.goals);
    setScores(mergeScoresForDays(state.scores, challengeDays, participantIds, loadedMetrics));
    setSelectedDay(state.challenge.startDate);
  };

  const refreshChallengeList = async () => {
    try {
      const list = await challengeTracker.list();
      setChallengeList({
        active: Array.isArray(list?.active) ? list.active : [],
        past: Array.isArray(list?.past) ? list.past : [],
      });
    } catch (error) {
      console.error('Failed to load challenge list', error);
      setChallengeList({ active: [], past: [] });
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const list = await challengeTracker.list();
        if (cancelled) return;

        const nextList = {
          active: Array.isArray(list?.active) ? list.active : [],
          past: Array.isArray(list?.past) ? list.past : [],
        };

        setChallengeList(nextList);
        setSelectedChallengeId(null);
        setShowChallengeForm(false);

        if (!nextList.active.length && !nextList.past.length) {
          setChallenge(defaultChallenge);
          setMetrics(defaultMetrics);
          setDraftMetrics(defaultMetrics);
          setParticipants(defaultParticipants);
          setDraftParticipants(defaultParticipants);
          setGoals(defaultGoals);
          setDraftGoals(defaultGoals);
          setScores(createInitialScores(
            buildChallengeDays(defaultChallenge.startDate, defaultChallenge.endDate),
            defaultParticipants.map((p) => p.id),
          ));
          setSelectedDay(defaultChallenge.startDate);
        }
      } catch (error) {
        console.error('Failed to load challenge tracker', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const dailyTotals = participants.map((participant) => ({
    ...participant,
    total: calculateDailyTotal(scores[selectedDay]?.[participant.id] || makeEmptyEntry(metrics), goals[participant.id], metrics),
  }));

  const leaderboard = participants.map((participant) => {
    const total = days.reduce((sum, day) => {
      const dayKey = formatDayKey(day);
      return sum + calculateDailyTotal(scores[dayKey]?.[participant.id] || makeEmptyEntry(metrics), goals[participant.id], metrics);
    }, 0);
    return { ...participant, total, average: Math.round(total / days.length) };
  }).sort((a, b) => b.total - a.total);

  const maxChallengePoints = days.length * maxDailyPoints;
  const powerCoupleDays = maxDailyPoints > 0 ? days.filter((day) => {
    const key = formatDayKey(day);
    return participants.every((participant) => calculateDailyTotal(
      scores[key]?.[participant.id] || makeEmptyEntry(metrics),
      goals[participant.id],
      metrics,
    ) >= powerCoupleThreshold);
  }).length : 0;

  const weeklySummary = Array.from({ length: Math.ceil(days.length / 7) }, (_, weekIndex) => {
    const weekDays = days.slice(weekIndex * 7, weekIndex * 7 + 7);
    return {
      label: `Week ${weekIndex + 1}`,
      days: weekDays,
      totals: participants.map((participant) => ({
        ...participant,
        total: weekDays.reduce((sum, day) => {
          const dayKey = formatDayKey(day);
          return sum + calculateDailyTotal(scores[dayKey]?.[participant.id] || makeEmptyEntry(metrics), goals[participant.id], metrics);
        }, 0),
      })),
    };
  });

  const updateScore = (participantId, key, value) => {
    setScores((current) => {
      const dayScores = current[selectedDay] || {};
      const participantEntry = { ...(dayScores[participantId] || makeEmptyEntry(metrics)), [key]: value };
      const next = {
        ...current,
        [selectedDay]: {
          ...dayScores,
          [participantId]: participantEntry,
        },
      };

      challengeTracker.saveEntry({
        challengeId: challengeId || selectedChallengeId,
        date: selectedDay,
        participantId,
        entry: participantEntry,
        customValues: Object.fromEntries(metrics
          .map((metric) => [metric.key, participantEntry[metric.key]])),
      }).catch((error) => {
        console.error('Failed to save daily entry', error);
      });

      return next;
    });
  };

  const updateDraftGoal = (participantId, key, value) => {
    setDraftGoals((current) => ({
      ...current,
      [participantId]: { ...current[participantId], [key]: value },
    }));
  };

  const updateDraftMetric = (metricKey, field, value) => {
    setDraftMetrics((current) => current.map((metric) => (
      metric.key === metricKey ? { ...metric, [field]: value } : metric
    )));
  };

  const addDraftMetric = () => {
    const key = `metric-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setDraftMetrics((current) => [...current, {
      key,
      label: '',
      unit: '',
      inputType: 'number',
      scoringType: 'atLeast',
      points: 10,
    }]);
    setDraftGoals((current) => Object.fromEntries(Object.entries(current).map(([participantId, participantGoals]) => [
      participantId,
      { ...participantGoals, [key]: 0 },
    ])));
  };

  const removeDraftMetric = (metricKey) => {
    setDraftMetrics((current) => current.filter((metric) => metric.key !== metricKey));
  };

  const updateDraftParticipant = (participantId, field, value) => {
    if (field === 'name') {
      setDraftParticipants((current) => current.map((participant) => (
        participant.id === participantId ? { ...participant, name: value } : participant
      )));
      return;
    }

    if (field === 'email') {
      const newEmail = (value || '').trim();
      const newId = newEmail ? newEmail.toLowerCase() : participantId;

      // Update participants list (id and email)
      setDraftParticipants((current) => current.map((participant) => (
        participant.id === participantId ? { ...participant, email: newEmail, id: newId } : participant
      )));

      // Move goals from old id to new id if necessary
      setDraftGoals((current) => {
        if (!newId || newId === participantId) return current;
        const next = { ...current };
        next[newId] = next[participantId] || {
          maxCalories: 0,
          workoutMinutes: 0,
          minSteps: 0,
          proteinGrams: 0,
          waterLiters: 0,
        };
        if (participantId in next) delete next[participantId];
        return next;
      });
    }
  };

  const saveChallenge = async () => {
    if (draftMetrics.some((metric) => !metric.label.trim())) {
      window.alert('Add a name to each challenge field before saving.');
      return;
    }
    const nextDays = buildChallengeDays(draftChallenge.startDate, draftChallenge.endDate);
    const participantIds = draftParticipants.map((participant) => participant.id);

    try {
      const saved = await challengeTracker.saveConfig({
        challengeId,
        challenge: draftChallenge,
        participants: draftParticipants,
        goals: draftGoals,
        metrics: draftMetrics,
      });
      if (saved?.challengeId) {
        setChallengeId(saved.challengeId);
        setSelectedChallengeId(saved.challengeId);
      }
      await refreshChallengeList();
    } catch (error) {
      console.error('Failed to save challenge', error);
      return;
    }

    setChallenge(draftChallenge);
    setMetrics(draftMetrics);
    setParticipants(draftParticipants);
    setGoals(draftGoals);
    setSelectedDay(draftChallenge.startDate);
    setScores((current) => mergeScoresForDays(current, nextDays, participantIds, draftMetrics));
    setShowChallengeForm(false);
  };

  const openChallengeForm = () => {
    setDraftChallenge(challenge);
    setDraftMetrics(metrics);
    setDraftParticipants(participants);
    setDraftGoals(goals);
    setShowChallengeForm(true);
  };

  const deleteSelectedChallenge = async () => {
    if (!challengeId) return;
    const confirmed = window.confirm('Delete this challenge? This removes all saved entries for it.');
    if (!confirmed) return;

    try {
      await challengeTracker.delete(challengeId);
      setSelectedChallengeId(null);
      setChallengeId(null);
      setChallenge(defaultChallenge);
      setMetrics(defaultMetrics);
      setDraftMetrics(defaultMetrics);
      setParticipants(defaultParticipants);
      setDraftChallenge(defaultChallenge);
      setDraftParticipants(defaultParticipants);
      setGoals(defaultGoals);
      setDraftGoals(defaultGoals);
      setShowChallengeForm(false);
      setSelectedDay(defaultChallenge.startDate);
      setScores(createInitialScores(
        buildChallengeDays(defaultChallenge.startDate, defaultChallenge.endDate),
        defaultParticipants.map((p) => p.id),
      ));
      await refreshChallengeList();
    } catch (error) {
      console.error('Failed to delete challenge', error);
    }
  };

  const deleteChallengeCard = async (event, challengeMeta) => {
    event.stopPropagation();
    if (!challengeMeta?.id) return;
    const confirmed = window.confirm('Delete this challenge? This removes all saved entries for it.');
    if (!confirmed) return;

    try {
      await challengeTracker.delete(challengeMeta.id);
      if (selectedChallengeId === challengeMeta.id) {
        setSelectedChallengeId(null);
        setChallengeId(null);
        setChallenge(defaultChallenge);
        setMetrics(defaultMetrics);
        setDraftMetrics(defaultMetrics);
        setParticipants(defaultParticipants);
        setDraftChallenge(defaultChallenge);
        setDraftParticipants(defaultParticipants);
        setGoals(defaultGoals);
        setDraftGoals(defaultGoals);
        setShowChallengeForm(false);
        setSelectedDay(defaultChallenge.startDate);
        setScores(createInitialScores(
          buildChallengeDays(defaultChallenge.startDate, defaultChallenge.endDate),
          defaultParticipants.map((p) => p.id),
        ));
      }
      await refreshChallengeList();
    } catch (error) {
      console.error('Failed to delete challenge', error);
    }
  };

  const startNewChallenge = () => {
    setSelectedChallengeId(null);
    setChallengeId(null);
    setChallenge(defaultChallenge);
    setMetrics(defaultMetrics);
    setDraftMetrics(defaultMetrics);
    setParticipants(defaultParticipants);
    setDraftChallenge(defaultChallenge);
    setDraftParticipants(defaultParticipants);
    setGoals(defaultGoals);
    setDraftGoals(defaultGoals);
    setSelectedDay(defaultChallenge.startDate);
    setScores(createInitialScores(
      buildChallengeDays(defaultChallenge.startDate, defaultChallenge.endDate),
      defaultParticipants.map((p) => p.id),
    ));
    setShowChallengeForm(true);
  };

  const openChallenge = async (challengeMeta) => {
    try {
      const state = await challengeTracker.loadById(challengeMeta.id);
      applyChallengeState(state);
      setSelectedChallengeId(challengeMeta.id);
      setChallengeId(challengeMeta.id);
      setShowChallengeForm(false);
    } catch (error) {
      console.error('Failed to load challenge', error);
    }
  };

  const leader = leaderboard[0];
  const runnerUp = leaderboard[1];
  const sharedWith = participants
    .map((participant) => participant.email || participant.name)
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);

  if (!selectedChallengeId && !showChallengeForm) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#38bdf8_0,transparent_35%),radial-gradient(circle_at_top_right,#f472b6_0,transparent_30%),linear-gradient(180deg,#0f172a_0%,#f8fafc_42%)] text-slate-900">
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <section className="overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 p-6 text-white shadow-2xl backdrop-blur md:p-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-cyan-100">
                    <Trophy className="h-4 w-4" /> Challenge tracker
                  </div>
                  <h1 className="font-display text-3xl font-black leading-tight md:text-5xl">Choose an active challenge</h1>
                </div>
                <button type="button" onClick={startNewChallenge} className="rounded-full bg-white px-5 py-3 font-black text-slate-900 shadow-lg transition hover:-translate-y-0.5">Create new challenge</button>
              </div>
            </section>

            <section className="space-y-6">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-2xl font-black text-white">Ongoing challenges</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {challengeList.active.length === 0 ? (
                    <div className="rounded-3xl bg-white p-8 text-center shadow-lg md:col-span-2 xl:col-span-3">
                      <p className="mb-3 text-xl font-black text-slate-900">No ongoing challenges</p>
                      <p className="mb-6 text-slate-500">Create your first challenge and invite teammates by email to share progress.</p>
                      <button type="button" onClick={startNewChallenge} className="rounded-2xl bg-slate-900 px-5 py-3 font-black text-white">Create challenge</button>
                    </div>
                  ) : (
                    challengeList.active.map((challengeItem) => (
                      <div
                        key={challengeItem.id}
                        className="group rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-lg transition hover:-translate-y-1 hover:shadow-xl"
                      >
                        <button
                          type="button"
                          onClick={() => openChallenge(challengeItem)}
                          className="w-full text-left"
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
                              <Trophy className="h-3.5 w-3.5" /> Active
                            </span>
                            <span className="text-xs font-semibold text-slate-500">{formatDate(parseLocalDate(challengeItem.startDate))} – {formatDate(parseLocalDate(challengeItem.endDate))}</span>
                          </div>
                          <h2 className="text-2xl font-black text-slate-900">{challengeItem.title}</h2>
                          <p className="mt-3 text-sm text-slate-500">Results publish {formatDate(parseLocalDate(challengeItem.publishDate))}</p>
                          <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                            <span className="font-semibold text-slate-700">Shared with:</span> {challengeItem.sharedWith?.length ? challengeItem.sharedWith.join(', ') : 'Only you'}
                          </div>
                        </button>
                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            onClick={(event) => deleteChallengeCard(event, challengeItem)}
                            className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-600 transition hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-2xl font-black text-white">Past challenges</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {challengeList.past.length === 0 ? (
                    <div className="rounded-3xl bg-white/80 p-5 text-sm text-slate-600 shadow-md md:col-span-2 xl:col-span-3">
                      No past challenges yet.
                    </div>
                  ) : (
                    challengeList.past.map((challengeItem) => (
                      <div
                        key={challengeItem.id}
                        className="group rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-lg transition hover:-translate-y-1 hover:shadow-xl"
                      >
                        <button
                          type="button"
                          onClick={() => openChallenge(challengeItem)}
                          className="w-full text-left"
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                              <CalendarDays className="h-3.5 w-3.5" /> Past
                            </span>
                            <span className="text-xs font-semibold text-slate-500">{formatDate(parseLocalDate(challengeItem.startDate))} – {formatDate(parseLocalDate(challengeItem.endDate))}</span>
                          </div>
                          <h2 className="text-2xl font-black text-slate-900">{challengeItem.title}</h2>
                          <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                            <span className="font-semibold text-slate-700">Shared with:</span> {challengeItem.sharedWith?.length ? challengeItem.sharedWith.join(', ') : 'Only you'}
                          </div>
                        </button>
                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            onClick={(event) => deleteChallengeCard(event, challengeItem)}
                            className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-600 transition hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#38bdf8_0,transparent_35%),radial-gradient(circle_at_top_right,#f472b6_0,transparent_30%),linear-gradient(180deg,#0f172a_0%,#f8fafc_42%)] text-slate-900">
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 p-6 text-white shadow-2xl backdrop-blur md:p-8">
            <div className="grid gap-8 lg:grid-cols-[1.4fr_.6fr] lg:items-center">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-cyan-100">
                  <Sparkles className="h-4 w-4" /> {challenge.title}
                </div>
                <h1 className="font-display text-4xl font-black leading-tight md:text-6xl">30 days. 2 players. Personalized goals.</h1>
                <p className="mt-4 max-w-2xl text-lg text-slate-200">Customize the daily habits and goals that matter to your challenge, then track everyone’s progress together.</p>
                <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
                  <span className="rounded-full bg-white px-4 py-2 text-slate-900"><CalendarDays className="mr-2 inline h-4 w-4" />{formatDate(parseLocalDate(challenge.startDate))} – {formatDate(parseLocalDate(challenge.endDate))}</span>
                  <span className="rounded-full bg-amber-300 px-4 py-2 text-amber-950"><PartyPopper className="mr-2 inline h-4 w-4" />Results publish {formatDate(parseLocalDate(challenge.publishDate))}</span>
                  <span className="rounded-full bg-emerald-300 px-4 py-2 text-emerald-950">{metrics.length} customizable tracking fields</span>
                </div>
                {sharedWith.length > 0 && (
                  <div className="mt-5 rounded-2xl border border-white/20 bg-slate-900/20 px-4 py-3 text-sm text-slate-100 backdrop-blur-sm">
                    <span className="font-semibold text-cyan-100">Shared with:</span> {sharedWith.join(', ')}
                  </div>
                )}
                <div className="mt-6 flex flex-wrap gap-3">
                  <button type="button" onClick={openChallengeForm} className="rounded-full bg-white px-5 py-3 font-black text-slate-900 shadow-lg transition hover:-translate-y-0.5">Edit Challenge</button>
                  <button type="button" onClick={deleteSelectedChallenge} className="rounded-full border border-white/70 bg-white/10 px-5 py-3 font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-white/20">Delete Challenge</button>
                </div>
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
            <h2 className="mb-2 text-xl font-black">{challengeId ? 'Edit challenge' : 'Create challenge'}</h2>
            <p className="mb-4 text-sm text-slate-500">Customize the fields everyone tracks, set participant targets, and choose which fields count toward the score. Saving keeps your logged daily entries.</p>
            <div className="mb-4 grid gap-3 md:grid-cols-3"><label className="block rounded-2xl bg-slate-50 p-3"><span className="mb-2 block text-sm font-bold text-slate-600">Challenge title</span><input value={draftChallenge.title} onChange={(event) => setDraftChallenge((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-semibold" /></label><label className="block rounded-2xl bg-slate-50 p-3"><span className="mb-2 block text-sm font-bold text-slate-600">Start date</span><input type="date" value={draftChallenge.startDate} onChange={(event) => setDraftChallenge((current) => ({ ...current, startDate: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-semibold" /></label><label className="block rounded-2xl bg-slate-50 p-3"><span className="mb-2 block text-sm font-bold text-slate-600">End date</span><input type="date" value={draftChallenge.endDate} onChange={(event) => setDraftChallenge((current) => ({ ...current, endDate: event.target.value, publishDate: getPublishDateString(event.target.value) }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-semibold" /></label></div>
            <div className="mb-5 rounded-3xl border border-slate-100 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black">Daily tracking fields</h3>
                  <p className="text-sm text-slate-500">Rename, add, or remove fields. Number fields can be scored against a goal or kept for reference.</p>
                </div>
                <button type="button" onClick={addDraftMetric} className="rounded-xl bg-sky-100 px-4 py-2 font-bold text-sky-800">Add field</button>
              </div>
              {draftMetrics.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No tracking fields yet. Add one to start tracking challenge progress.</p>}
              <div className="space-y-3">
                {draftMetrics.map((metric) => (
                  <div key={metric.key} className="grid gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-6">
                    <label className="block lg:col-span-2">
                      <span className="mb-1 block text-xs font-bold text-slate-500">Field name</span>
                      <input value={metric.label} onChange={(event) => updateDraftMetric(metric.key, 'label', event.target.value)} placeholder="e.g. Read 20 pages" className="w-full rounded-xl border border-slate-200 px-3 py-2 font-semibold" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-slate-500">Field type</span>
                      <select
                        value={metric.inputType}
                        onChange={(event) => {
                          const inputType = event.target.value;
                          updateDraftMetric(metric.key, 'inputType', inputType);
                          updateDraftMetric(metric.key, 'scoringType', inputType === 'checkbox' ? 'checkbox' : 'atLeast');
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                      >
                        <option value="number">Number</option>
                        <option value="checkbox">Completed / not completed</option>
                      </select>
                    </label>
                    {metric.inputType === 'number' && (
                      <>
                        <label className="block">
                          <span className="mb-1 block text-xs font-bold text-slate-500">Unit</span>
                          <input value={metric.unit || ''} onChange={(event) => updateDraftMetric(metric.key, 'unit', event.target.value)} placeholder="e.g. minutes" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-bold text-slate-500">Scoring</span>
                          <select value={metric.scoringType} onChange={(event) => updateDraftMetric(metric.key, 'scoringType', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <option value="atLeast">Meet or exceed goal</option>
                            <option value="atMost">Stay at or below goal</option>
                            <option value="steps">Graduated step score</option>
                            <option value="none">Reference only</option>
                          </select>
                        </label>
                      </>
                    )}
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-slate-500">Points</span>
                      <input type="number" min="0" value={metric.scoringType === 'none' ? 0 : metric.points} disabled={metric.scoringType === 'none'} onChange={(event) => updateDraftMetric(metric.key, 'points', Number(event.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100" />
                    </label>
                    <div className="flex items-end justify-end">
                      <button type="button" onClick={() => removeDraftMetric(metric.key)} className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {draftParticipants.map((participant) => (
                <div key={participant.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <label className="mb-4 block">
                      <span className="mb-2 block text-sm font-bold text-slate-600">Participant name</span>
                      <input
                        value={participant.name}
                        onChange={(event) => updateDraftParticipant(participant.id, 'name', event.target.value)}
                        className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-2xl font-black ${participant.text}`}
                      />
                      <span className="mb-2 mt-3 block text-sm font-bold text-slate-600">Participant email (optional — used for sharing)</span>
                      <input
                        type="email"
                        value={participant.email || ''}
                        onChange={(event) => updateDraftParticipant(participant.id, 'email', event.target.value)}
                        placeholder="name@example.com"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                      />
                    </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                      {draftMetrics.filter((metric) => metric.inputType === 'number' && metric.scoringType !== 'none').map((metric) => (
                        <label key={metric.key} className="block rounded-2xl bg-white p-3 shadow-sm">
                          <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-600">{metric.label} {metric.unit && <span className="font-normal text-slate-400">({metric.unit})</span>}</span>
                        <input
                          type="number"
                          min="0"
                            step="any"
                            value={draftGoals[participant.id]?.[goalFieldKey(metric.key)] ?? 0}
                            onChange={(event) => updateDraftGoal(participant.id, goalFieldKey(metric.key), Number(event.target.value))}
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
              <h2 className="mb-4 flex items-center gap-2 text-xl font-black"><Scale className="h-5 w-5 text-emerald-500" /> Scoring</h2>
              <div className="space-y-3">
                {metrics.map((metric) => {
                  const Icon = metricIcons[metric.key] || Sparkles;
                  return <div key={metric.key} className={`flex items-center justify-between rounded-2xl p-3 ${metric.scoringType === 'none' ? 'bg-indigo-50 text-indigo-800' : 'bg-slate-50'}`}><span className="flex items-center gap-2 font-medium"><Icon className="h-4 w-4 text-slate-500" />{metric.label}</span><b>{metric.scoringType === 'none' ? 'Reference' : `${metric.points} pts`}</b></div>;
                })}
              </div>
              <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">Up to {maxDailyPoints} points are available each day. Reference fields do not add points.</p>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-lg lg:col-span-5">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-xl font-black">Daily score tracker</h2><p className="text-sm text-slate-500">Pick a day, then log each participant’s progress for the challenge fields.</p></div>
                <select value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold shadow-sm">
                  {days.map((day) => <option key={formatDayKey(day)} value={formatDayKey(day)}>{day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</option>)}
                </select>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {participants.map((participant) => {
                  const entry = scores[selectedDay]?.[participant.id] || makeEmptyEntry(metrics);
                  const participantGoals = goals[participant.id] || {};
                  const total = calculateDailyTotal(entry, participantGoals, metrics);
                  return <div key={participant.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <div className="mb-4 flex items-center justify-between"><div><h3 className={`text-2xl font-black ${participant.text}`}>{participant.name}</h3>{participant.email && <p className="mt-1 text-xs font-medium text-slate-500">{participant.email}</p>}</div><span className="rounded-full bg-white px-3 py-1 text-lg font-black shadow-sm">{total}/{maxDailyPoints}</span></div>
                    <ProgressBar value={total} max={maxDailyPoints} gradient={participant.color} />
                    <div className="mt-4 space-y-3">
                      {metrics.map((metric) => {
                        const Icon = metricIcons[metric.key] || Sparkles;
                        const goal = participantGoals[goalFieldKey(metric.key)] ?? 0;
                        const metricScore = scoreMetric(entry, participantGoals, metric);
                        if (metric.inputType === 'checkbox') {
                          return <label key={metric.key} className="flex cursor-pointer items-center justify-between rounded-2xl bg-white p-3 shadow-sm transition hover:-translate-y-0.5">
                            <span className="flex items-center gap-2 font-medium"><Icon className="h-4 w-4 text-slate-500" />{metric.label}</span>
                            <span className="flex items-center gap-3"><span className="text-sm font-semibold">{metric.scoringType === 'none' ? 'Reference' : `${metricScore}/${metric.points} pts`}</span><input type="checkbox" checked={!!entry[metric.key]} onChange={(event) => updateScore(participant.id, metric.key, event.target.checked)} className="h-5 w-5 rounded text-sky-600" /></span>
                          </label>;
                        }
                        const goalDescription = metric.scoringType === 'atMost'
                          ? `Goal ≤ ${goal}${metric.unit ? ` ${metric.unit}` : ''}`
                          : metric.scoringType === 'atLeast'
                            ? `Goal ≥ ${goal}${metric.unit ? ` ${metric.unit}` : ''}`
                            : metric.scoringType === 'steps'
                              ? 'Graduated step score'
                              : 'Reference only';
                        return <label key={metric.key} className={`block rounded-2xl p-3 shadow-sm ${metric.scoringType === 'none' ? 'bg-indigo-50' : 'bg-white'}`}>
                          <span className="mb-2 flex items-center justify-between gap-2 text-sm font-bold">
                            <span className="flex items-center gap-2"><Icon className="h-4 w-4 shrink-0" />{metric.label} {metric.unit && <span className="font-normal text-slate-500">({metric.unit})</span>}</span>
                            <span className="shrink-0">{metric.scoringType === 'none' ? '0 pts' : `${metricScore}/${metric.points} pts`}</span>
                          </span>
                          <input type="number" min="0" step="any" value={entry[metric.key] ?? 0} onChange={(event) => updateScore(participant.id, metric.key, Number(event.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                          <p className="mt-1 text-xs text-slate-500">{goalDescription}</p>
                        </label>;
                      })}
                    </div>
                  </div>;
                })}
              </div>
              {maxDailyPoints > 0 && dailyTotals.every((player) => player.total >= powerCoupleThreshold) && <div className="mt-4 rounded-3xl bg-gradient-to-r from-amber-200 to-pink-200 p-4 font-black text-amber-950 animate-pulse"><PartyPopper className="mr-2 inline h-5 w-5" />Power Couple Bonus unlocked today: everyone scored at least {powerCoupleThreshold} points!</div>}
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
                <li>• Challenge fields can be customized for each group.</li>
                <li>• Keep goals safe and sustainable.</li>
                <li>• Winner chooses a healthy celebration date.</li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
