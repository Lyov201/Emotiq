import { useForm } from "react-hook-form"
import { MOOD_LIMITS } from "../constants/moods"
import type { CreateMoodRequest } from "../features/moods/moodtypes"

export const MoodTracking = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateMoodRequest>({
    defaultValues: {
      note: "",
    },
  })
  const onSubmit = (data: CreateMoodRequest) => {
    console.log(data)
  }
  return (
    <main>
      <h1>How are you feeling today?</h1>
      <p>Take a moment to check in with yourself.</p>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label htmlFor="moodScore">Your mood, from 1 to 5</label>
          <input
            id="moodScore"
            type="number"
            min={MOOD_LIMITS.MIN_SCORE}
            max={MOOD_LIMITS.MAX_SCORE}
            step={1}
            aria-invalid={Boolean(errors.moodScore)}
            aria-describedby="mood-help mood-error"
            {...register("moodScore", {
              valueAsNumber: true,
              required: "Choose your mood score",
              min: {
                value: MOOD_LIMITS.MIN_SCORE,
                message: `Minimum score is ${MOOD_LIMITS.MIN_SCORE}`,
              },
              max: {
                value: MOOD_LIMITS.MAX_SCORE,
                message: `Maximum score is ${MOOD_LIMITS.MAX_SCORE}`,
              },
              validate: value =>
                Number.isInteger(value) || "Choose a whole number",
            })}
          />
          <p id="mood-help">1 — Very low · 3 — Okay · 5 — Very good</p>
          <p id="mood-error" role="alert">
            {errors.moodScore?.message}
          </p>
        </div>
        <div>
          <label htmlFor="note">A note about your day (optional)</label>
          <textarea
            id="note"
            rows={4}
            maxLength={MOOD_LIMITS.MAX_NOTE_LENGTH}
            aria-invalid={Boolean(errors.note)}
            aria-describedby="note-error"
            {...register("note", {
              maxLength: {
                value: MOOD_LIMITS.MAX_NOTE_LENGTH,
                message: `Use at most ${MOOD_LIMITS.MAX_NOTE_LENGTH} characters`,
              },
            })}
          />
          <p id="note-error" role="alert">
            {errors.note?.message}
          </p>
        </div>
        <button type="submit" disabled={isSubmitting}>
          Save mood
        </button>
      </form>
    </main>
  )
}
