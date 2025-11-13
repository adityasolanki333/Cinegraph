import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Sparkles, ChevronRight, ChevronLeft, RotateCcw } from 'lucide-react';

interface UserPreferences {
  mediaType: string[];
  releaseYearRange: [number, number];
  ratingRange: [number, number];
  genres: string[];
  moods: string[];
  languages: string[];
  runtime: string;
}

interface PreferenceWizardProps {
  onComplete: (preferences: UserPreferences) => void;
  onSkip: () => void;
  onReset?: () => void;
}

export function PreferenceWizard({ onComplete, onSkip, onReset }: PreferenceWizardProps) {
  const [step, setStep] = useState(1);
  const [preferences, setPreferences] = useState<UserPreferences>({
    mediaType: ['movie'],  // Use singular form as expected by backend
    releaseYearRange: [2010, 2025],
    ratingRange: [6.5, 10.0],
    genres: [],
    moods: [],
    languages: ['English'],
    runtime: 'any'
  });

  const totalSteps = 7;
  const progress = (step / totalSteps) * 100;

  const genres = [
    { name: 'Action', emoji: '🎬', color: 'bg-red-500/20 hover:bg-red-500/30 border-red-400 text-red-700 dark:text-red-300', activeColor: 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/50' },
    { name: 'Adventure', emoji: '🗺️', color: 'bg-orange-500/20 hover:bg-orange-500/30 border-orange-400 text-orange-700 dark:text-orange-300', activeColor: 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/50' },
    { name: 'Animation', emoji: '🎨', color: 'bg-pink-500/20 hover:bg-pink-500/30 border-pink-400 text-pink-700 dark:text-pink-300', activeColor: 'bg-pink-500 text-white border-pink-500 shadow-lg shadow-pink-500/50' },
    { name: 'Comedy', emoji: '😄', color: 'bg-yellow-500/20 hover:bg-yellow-500/30 border-yellow-400 text-yellow-700 dark:text-yellow-300', activeColor: 'bg-yellow-500 text-white border-yellow-500 shadow-lg shadow-yellow-500/50' },
    { name: 'Crime', emoji: '🕵️', color: 'bg-slate-500/20 hover:bg-slate-500/30 border-slate-400 text-slate-700 dark:text-slate-300', activeColor: 'bg-slate-600 text-white border-slate-600 shadow-lg shadow-slate-600/50' },
    { name: 'Documentary', emoji: '📹', color: 'bg-teal-500/20 hover:bg-teal-500/30 border-teal-400 text-teal-700 dark:text-teal-300', activeColor: 'bg-teal-500 text-white border-teal-500 shadow-lg shadow-teal-500/50' },
    { name: 'Drama', emoji: '🎭', color: 'bg-purple-500/20 hover:bg-purple-500/30 border-purple-400 text-purple-700 dark:text-purple-300', activeColor: 'bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/50' },
    { name: 'Family', emoji: '👨‍👩‍👧‍👦', color: 'bg-green-500/20 hover:bg-green-500/30 border-green-400 text-green-700 dark:text-green-300', activeColor: 'bg-green-500 text-white border-green-500 shadow-lg shadow-green-500/50' },
    { name: 'Fantasy', emoji: '🧙‍♂️', color: 'bg-violet-500/20 hover:bg-violet-500/30 border-violet-400 text-violet-700 dark:text-violet-300', activeColor: 'bg-violet-500 text-white border-violet-500 shadow-lg shadow-violet-500/50' },
    { name: 'History', emoji: '📜', color: 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400 text-amber-700 dark:text-amber-300', activeColor: 'bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-600/50' },
    { name: 'Horror', emoji: '😱', color: 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-400 text-rose-700 dark:text-rose-300', activeColor: 'bg-rose-600 text-white border-rose-600 shadow-lg shadow-rose-600/50' },
    { name: 'Music', emoji: '🎵', color: 'bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-400 text-cyan-700 dark:text-cyan-300', activeColor: 'bg-cyan-500 text-white border-cyan-500 shadow-lg shadow-cyan-500/50' },
    { name: 'Mystery', emoji: '🔍', color: 'bg-indigo-500/20 hover:bg-indigo-500/30 border-indigo-400 text-indigo-700 dark:text-indigo-300', activeColor: 'bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/50' },
    { name: 'Romance', emoji: '💕', color: 'bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border-fuchsia-400 text-fuchsia-700 dark:text-fuchsia-300', activeColor: 'bg-fuchsia-500 text-white border-fuchsia-500 shadow-lg shadow-fuchsia-500/50' },
    { name: 'Science Fiction', emoji: '🚀', color: 'bg-blue-500/20 hover:bg-blue-500/30 border-blue-400 text-blue-700 dark:text-blue-300', activeColor: 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/50' },
    { name: 'Thriller', emoji: '🔥', color: 'bg-orange-600/20 hover:bg-orange-600/30 border-orange-500 text-orange-800 dark:text-orange-300', activeColor: 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-600/50' },
    { name: 'War', emoji: '⚔️', color: 'bg-stone-500/20 hover:bg-stone-500/30 border-stone-400 text-stone-700 dark:text-stone-300', activeColor: 'bg-stone-600 text-white border-stone-600 shadow-lg shadow-stone-600/50' },
    { name: 'Western', emoji: '🤠', color: 'bg-lime-500/20 hover:bg-lime-500/30 border-lime-400 text-lime-700 dark:text-lime-300', activeColor: 'bg-lime-600 text-white border-lime-600 shadow-lg shadow-lime-600/50' }
  ];

  const moods = [
    { name: 'Feel-good', emoji: '😊', color: 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400 text-emerald-700 dark:text-emerald-300', activeColor: 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/50' },
    { name: 'Exciting', emoji: '⚡', color: 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400 text-amber-700 dark:text-amber-300', activeColor: 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/50' },
    { name: 'Thought-provoking', emoji: '🤔', color: 'bg-sky-500/20 hover:bg-sky-500/30 border-sky-400 text-sky-700 dark:text-sky-300', activeColor: 'bg-sky-500 text-white border-sky-500 shadow-lg shadow-sky-500/50' },
    { name: 'Romantic', emoji: '💖', color: 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-400 text-rose-700 dark:text-rose-300', activeColor: 'bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-500/50' },
    { name: 'Suspenseful', emoji: '😰', color: 'bg-purple-500/20 hover:bg-purple-500/30 border-purple-400 text-purple-700 dark:text-purple-300', activeColor: 'bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/50' },
    { name: 'Funny', emoji: '😂', color: 'bg-yellow-500/20 hover:bg-yellow-500/30 border-yellow-400 text-yellow-700 dark:text-yellow-300', activeColor: 'bg-yellow-500 text-white border-yellow-500 shadow-lg shadow-yellow-500/50' },
    { name: 'Inspiring', emoji: '✨', color: 'bg-indigo-500/20 hover:bg-indigo-500/30 border-indigo-400 text-indigo-700 dark:text-indigo-300', activeColor: 'bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/50' },
    { name: 'Dark', emoji: '🌑', color: 'bg-slate-700/20 hover:bg-slate-700/30 border-slate-600 text-slate-800 dark:text-slate-300', activeColor: 'bg-slate-700 text-white border-slate-700 shadow-lg shadow-slate-700/50' },
    { name: 'Lighthearted', emoji: '🎈', color: 'bg-pink-500/20 hover:bg-pink-500/30 border-pink-400 text-pink-700 dark:text-pink-300', activeColor: 'bg-pink-500 text-white border-pink-500 shadow-lg shadow-pink-500/50' },
    { name: 'Intense', emoji: '💥', color: 'bg-red-600/20 hover:bg-red-600/30 border-red-500 text-red-800 dark:text-red-300', activeColor: 'bg-red-600 text-white border-red-600 shadow-lg shadow-red-600/50' }
  ];

  const languages = [
    { name: 'English', emoji: '🇬🇧', color: 'bg-blue-500/20 hover:bg-blue-500/30 border-blue-400 text-blue-700 dark:text-blue-300', activeColor: 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/50' },
    { name: 'Spanish', emoji: '🇪🇸', color: 'bg-orange-500/20 hover:bg-orange-500/30 border-orange-400 text-orange-700 dark:text-orange-300', activeColor: 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/50' },
    { name: 'French', emoji: '🇫🇷', color: 'bg-indigo-500/20 hover:bg-indigo-500/30 border-indigo-400 text-indigo-700 dark:text-indigo-300', activeColor: 'bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/50' },
    { name: 'German', emoji: '🇩🇪', color: 'bg-slate-500/20 hover:bg-slate-500/30 border-slate-400 text-slate-700 dark:text-slate-300', activeColor: 'bg-slate-600 text-white border-slate-600 shadow-lg shadow-slate-600/50' },
    { name: 'Italian', emoji: '🇮🇹', color: 'bg-green-500/20 hover:bg-green-500/30 border-green-400 text-green-700 dark:text-green-300', activeColor: 'bg-green-500 text-white border-green-500 shadow-lg shadow-green-500/50' },
    { name: 'Japanese', emoji: '🇯🇵', color: 'bg-red-500/20 hover:bg-red-500/30 border-red-400 text-red-700 dark:text-red-300', activeColor: 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/50' },
    { name: 'Korean', emoji: '🇰🇷', color: 'bg-teal-500/20 hover:bg-teal-500/30 border-teal-400 text-teal-700 dark:text-teal-300', activeColor: 'bg-teal-500 text-white border-teal-500 shadow-lg shadow-teal-500/50' },
    { name: 'Chinese', emoji: '🇨🇳', color: 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-400 text-rose-700 dark:text-rose-300', activeColor: 'bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-500/50' },
    { name: 'Hindi', emoji: '🇮🇳', color: 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400 text-amber-700 dark:text-amber-300', activeColor: 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/50' },
    { name: 'Portuguese', emoji: '🇵🇹', color: 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400 text-emerald-700 dark:text-emerald-300', activeColor: 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/50' },
    { name: 'Russian', emoji: '🇷🇺', color: 'bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-400 text-cyan-700 dark:text-cyan-300', activeColor: 'bg-cyan-500 text-white border-cyan-500 shadow-lg shadow-cyan-500/50' },
    { name: 'Arabic', emoji: '🇸🇦', color: 'bg-lime-500/20 hover:bg-lime-500/30 border-lime-400 text-lime-700 dark:text-lime-300', activeColor: 'bg-lime-500 text-white border-lime-500 shadow-lg shadow-lime-500/50' }
  ];

  const mediaTypeOptions = [
    { value: 'movie', label: 'Movies', emoji: '🎬', color: 'bg-blue-500/20 hover:bg-blue-500/30 border-blue-400 text-blue-700 dark:text-blue-300', activeColor: 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/50' },  // Use singular form as expected by backend
    { value: 'tv', label: 'TV Shows', emoji: '📺', color: 'bg-purple-500/20 hover:bg-purple-500/30 border-purple-400 text-purple-700 dark:text-purple-300', activeColor: 'bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/50' },
    { value: 'both', label: 'Both', emoji: '🎭', color: 'bg-pink-500/20 hover:bg-pink-500/30 border-pink-400 text-pink-700 dark:text-pink-300', activeColor: 'bg-pink-500 text-white border-pink-500 shadow-lg shadow-pink-500/50' }
  ];

  const runtimeOptions = [
    { value: 'short', label: 'Short (< 90 min)', emoji: '⏱️', color: 'bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-400 text-cyan-700 dark:text-cyan-300', activeColor: 'bg-cyan-500 text-white border-cyan-500 shadow-lg shadow-cyan-500/50' },
    { value: 'medium', label: 'Medium (90-120 min)', emoji: '⏳', color: 'bg-purple-500/20 hover:bg-purple-500/30 border-purple-400 text-purple-700 dark:text-purple-300', activeColor: 'bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/50' },
    { value: 'long', label: 'Long (> 120 min)', emoji: '🎞️', color: 'bg-indigo-500/20 hover:bg-indigo-500/30 border-indigo-400 text-indigo-700 dark:text-indigo-300', activeColor: 'bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/50' },
    { value: 'any', label: 'Any length', emoji: '🎬', color: 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400 text-emerald-700 dark:text-emerald-300', activeColor: 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/50' }
  ];

  const handleGenreToggle = (genreName: string) => {
    setPreferences(prev => ({
      ...prev,
      genres: prev.genres.includes(genreName)
        ? prev.genres.filter(g => g !== genreName)
        : [...prev.genres, genreName]
    }));
  };

  const handleMoodToggle = (moodName: string) => {
    setPreferences(prev => ({
      ...prev,
      moods: prev.moods.includes(moodName)
        ? prev.moods.filter(m => m !== moodName)
        : [...prev.moods, moodName]
    }));
  };

  const handleLanguageToggle = (languageName: string) => {
    setPreferences(prev => ({
      ...prev,
      languages: prev.languages.includes(languageName)
        ? prev.languages.filter(l => l !== languageName)
        : [...prev.languages, languageName]
    }));
  };

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      onComplete(preferences);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleReset = () => {
    // Reset preferences and go back to advanced finder
    if (onReset) {
      onReset();
    }
  };

  const handleMediaTypeToggle = (type: string) => {
    setPreferences(prev => ({
      ...prev,
      mediaType: prev.mediaType.includes(type)
        ? prev.mediaType.filter(t => t !== type)
        : [...prev.mediaType, type]
    }));
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold mb-3">What do you want to watch?</h3>
              <p className="text-base text-muted-foreground mb-6">Select movies, TV shows, or both</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {mediaTypeOptions.map((option) => (
                  <button
                    key={option.value}
                    className={`
                      cursor-pointer p-6 text-center justify-center rounded-xl border-2 font-semibold text-base
                      hover:scale-110 hover:-translate-y-1 active:scale-95 transition-all duration-300
                      ${preferences.mediaType.includes(option.value) 
                        ? `${option.activeColor} animate-pulse` 
                        : `${option.color} hover:shadow-2xl`
                      }
                    `}
                    onClick={() => handleMediaTypeToggle(option.value)}
                    data-testid={`media-type-${option.value}`}
                  >
                    <span className={`text-4xl mr-3 inline-block transition-transform duration-300 ${
                      preferences.mediaType.includes(option.value) 
                        ? 'animate-bounce drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]' 
                        : 'hover:scale-125 hover:drop-shadow-[0_0_16px_rgba(255,255,255,0.7)]'
                    }`}>
                      {option.emoji}
                    </span>
                    <span className="text-lg block mt-2">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold mb-3">Release Year Range</h3>
              <p className="text-base text-muted-foreground mb-6">Choose the years you'd like to explore</p>
              <div className="space-y-6">
                <Slider
                  value={preferences.releaseYearRange}
                  onValueChange={(value) => setPreferences(prev => ({ ...prev, releaseYearRange: [value[0], value[1]] }))}
                  min={1970}
                  max={2025}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-lg font-semibold text-primary">
                  <span className="bg-gradient-to-r from-primary/20 to-purple-500/20 px-5 py-3 rounded-xl border-2 border-primary/30 shadow-lg hover:shadow-primary/30 transition-all">
                    🎬 {preferences.releaseYearRange[0]}
                  </span>
                  <span className="bg-gradient-to-r from-purple-500/20 to-primary/20 px-5 py-3 rounded-xl border-2 border-primary/30 shadow-lg hover:shadow-primary/30 transition-all">
                    🎬 {preferences.releaseYearRange[1]}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold mb-3">IMDb Rating Range</h3>
              <p className="text-base text-muted-foreground mb-6">Set your minimum quality standards</p>
              <div className="space-y-6">
                <Slider
                  value={preferences.ratingRange}
                  onValueChange={(value) => setPreferences(prev => ({ ...prev, ratingRange: [value[0], value[1]] }))}
                  min={1.0}
                  max={10.0}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-lg font-semibold">
                  <span className="bg-gradient-to-r from-yellow-500/30 to-amber-500/30 text-yellow-700 dark:text-yellow-300 px-5 py-3 rounded-xl border-2 border-yellow-400 shadow-lg shadow-yellow-500/30 hover:shadow-yellow-500/50 transition-all">
                    <span className="animate-pulse drop-shadow-[0_0_8px_rgba(234,179,8,0.6)]">⭐</span> {preferences.ratingRange[0].toFixed(1)}
                  </span>
                  <span className="bg-gradient-to-r from-amber-500/30 to-yellow-500/30 text-yellow-700 dark:text-yellow-300 px-5 py-3 rounded-xl border-2 border-yellow-400 shadow-lg shadow-yellow-500/30 hover:shadow-yellow-500/50 transition-all">
                    <span className="animate-pulse drop-shadow-[0_0_8px_rgba(234,179,8,0.6)]">⭐</span> {preferences.ratingRange[1].toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold mb-3">Favorite Genres</h3>
              <p className="text-base text-muted-foreground mb-6">Select all genres you enjoy</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {genres.map((genre) => (
                  <button
                    key={genre.name}
                    className={`
                      cursor-pointer p-4 text-center justify-center rounded-xl border-2 font-semibold text-base
                      hover:scale-110 hover:-translate-y-1 active:scale-95 transition-all duration-300
                      ${preferences.genres.includes(genre.name) 
                        ? `${genre.activeColor} animate-pulse` 
                        : `${genre.color} hover:shadow-xl`
                      }
                    `}
                    onClick={() => handleGenreToggle(genre.name)}
                    data-testid={`genre-${genre.name.toLowerCase().replace(' ', '-')}`}
                  >
                    <span className={`text-3xl mr-2 inline-block transition-transform duration-300 ${
                      preferences.genres.includes(genre.name) 
                        ? 'animate-bounce drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' 
                        : 'hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]'
                    }`}>
                      {genre.emoji}
                    </span>
                    <span>{genre.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold mb-3">Preferred Moods</h3>
              <p className="text-base text-muted-foreground mb-6">What type of experience are you looking for?</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
                {moods.map((mood) => (
                  <button
                    key={mood.name}
                    className={`
                      cursor-pointer p-4 text-center justify-center rounded-xl border-2 font-semibold text-base min-h-11
                      hover:scale-110 hover:-translate-y-1 active:scale-95 transition-all duration-300
                      ${preferences.moods.includes(mood.name) 
                        ? `${mood.activeColor} animate-pulse` 
                        : `${mood.color} hover:shadow-xl`
                      }
                    `}
                    onClick={() => handleMoodToggle(mood.name)}
                    data-testid={`mood-${mood.name.toLowerCase().replace(' ', '-')}`}
                  >
                    <span className={`text-3xl mr-2 inline-block transition-transform duration-300 ${
                      preferences.moods.includes(mood.name) 
                        ? 'animate-bounce drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' 
                        : 'hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]'
                    }`}>
                      {mood.emoji}
                    </span>
                    <span>{mood.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold mb-3">Languages</h3>
              <p className="text-base text-muted-foreground mb-6">Select languages you're comfortable with</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {languages.map((language) => (
                  <button
                    key={language.name}
                    className={`
                      cursor-pointer p-4 text-center justify-center rounded-xl border-2 font-semibold text-base
                      hover:scale-110 hover:-translate-y-1 active:scale-95 transition-all duration-300
                      ${preferences.languages.includes(language.name) 
                        ? `${language.activeColor} animate-pulse` 
                        : `${language.color} hover:shadow-xl`
                      }
                    `}
                    onClick={() => handleLanguageToggle(language.name)}
                    data-testid={`language-${language.name.toLowerCase()}`}
                  >
                    <span className={`text-3xl mr-2 inline-block transition-transform duration-300 ${
                      preferences.languages.includes(language.name) 
                        ? 'animate-spin drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' 
                        : 'hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]'
                    }`}>
                      {language.emoji}
                    </span>
                    <span>{language.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold mb-3">Runtime Preference</h3>
              <p className="text-base text-muted-foreground mb-6">How long do you want your movies to be?</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {runtimeOptions.map((option) => (
                  <button
                    key={option.value}
                    className={`
                      cursor-pointer p-6 text-center justify-center rounded-xl border-2 font-semibold text-base
                      hover:scale-110 hover:-translate-y-1 active:scale-95 transition-all duration-300
                      ${preferences.runtime === option.value 
                        ? `${option.activeColor} animate-pulse` 
                        : `${option.color} hover:shadow-2xl`
                      }
                    `}
                    onClick={() => setPreferences(prev => ({ ...prev, runtime: option.value }))}
                    data-testid={`runtime-${option.value}`}
                  >
                    <span className={`text-4xl mr-3 inline-block transition-transform duration-300 ${
                      preferences.runtime === option.value 
                        ? 'animate-pulse drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]' 
                        : 'hover:scale-125 hover:drop-shadow-[0_0_16px_rgba(255,255,255,0.7)]'
                    }`}>
                      {option.emoji}
                    </span>
                    <span className="text-lg">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto shadow-2xl">
      <CardHeader className="text-center space-y-4 pb-6 bg-gradient-to-br from-primary/5 via-purple-500/5 to-pink-500/5 rounded-t-xl">
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          <Sparkles className="h-6 w-6 sm:h-10 sm:w-10 text-primary animate-pulse drop-shadow-[0_0_10px_rgba(139,92,246,0.6)]" />
          <CardTitle className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary via-purple-600 to-pink-600 bg-clip-text text-transparent animate-gradient">
            Movie Preference Wizard
          </CardTitle>
          <Sparkles className="h-6 w-6 sm:h-10 sm:w-10 text-pink-500 animate-pulse drop-shadow-[0_0_10px_rgba(236,72,153,0.6)]" />
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap justify-center gap-2 sm:justify-between text-sm sm:text-base font-medium text-muted-foreground">
            <span className="bg-primary/10 px-3 py-1 rounded-full">Step {step}/{totalSteps}</span>
            <span className="bg-accent/10 px-3 py-1 rounded-full">Takes ~40 seconds</span>
          </div>
          <Progress value={progress} className="w-full h-3" />
        </div>
      </CardHeader>

      <CardContent className="space-y-8 pb-6 sm:pb-8">
        {renderStep()}

        <div className="flex items-center justify-between gap-2 pt-6 border-t">
          <div className="flex gap-2">
            {step > 1 && (
              <Button 
                onClick={handleBack} 
                variant="outline"
                size="sm" 
                className="text-xs sm:text-base" 
                data-testid="button-back"
              >
                <ChevronLeft className="h-3 w-3 sm:h-5 sm:w-5 mr-1" />
                Back
              </Button>
            )}
            <Button 
              onClick={onSkip} 
              size="sm" 
              className="text-xs sm:text-base bg-emerald-600 hover:bg-emerald-700 text-white transition-all duration-200" 
              data-testid="button-skip"
            >
              Skip
            </Button>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleReset} 
              size="sm" 
              className="text-xs sm:text-base bg-red-500/10 hover:bg-red-500/20 border-red-400 text-red-700 dark:text-red-300 hover:border-red-500 transition-all duration-200" 
              data-testid="button-reset"
            >
              <RotateCcw className="h-3 w-3 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
              Reset
            </Button>
            <Button onClick={handleNext} size="sm" className="gap-1 sm:gap-2 text-xs sm:text-base sm:px-6" data-testid="button-next">
              {step === totalSteps ? '✨ Get Recommendations' : 'Next Step'}
              <ChevronRight className="h-3 w-3 sm:h-5 sm:w-5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}