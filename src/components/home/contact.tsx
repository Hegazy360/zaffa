"use client";

import Link from "next/link";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SplitText } from "./split-text";

const EVENT_TYPES = [
  { value: "wedding", label: "Wedding" },
  { value: "engagement", label: "Engagement / Katb el-kitab" },
  { value: "henna", label: "Henna night" },
  { value: "birthday", label: "Birthday" },
  { value: "corporate", label: "Corporate" },
  { value: "other", label: "Something else" },
];

const GUEST_RANGES = [
  { value: "0-50", label: "Under 50" },
  { value: "50-150", label: "50 – 150" },
  { value: "150-300", label: "150 – 300" },
  { value: "300-600", label: "300 – 600" },
  { value: "600+", label: "600+" },
];

interface FormState {
  name: string;
  email: string;
  eventType: string;
  date: string;
  guests: string;
  message: string;
}

const INITIAL: FormState = {
  name: "",
  email: "",
  eventType: "",
  date: "",
  guests: "",
  message: "",
};

export function Contact() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const glowY = useTransform(
    scrollYProgress,
    [0, 1],
    reduce ? ["0%", "0%"] : ["20%", "-25%"],
  );
  const glowOpacity = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    [0.15, 0.6, 0.15],
  );

  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    window.setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
      toast.success("Thank you. We'll be in touch soon.", {
        description: "A planner will reach out within 24 hours.",
      });
      setForm(INITIAL);
      window.setTimeout(() => setSubmitted(false), 4000);
    }, 700);
  }

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-hidden bg-zinc-950 text-zinc-50"
      id="contact"
    >
      <motion.div
        aria-hidden
        style={{ y: glowY, opacity: glowOpacity }}
        className="pointer-events-none absolute inset-x-0 top-1/2 h-[80vh] -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,_rgba(225,29,72,0.32),_transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px max-w-7xl bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-25 mix-blend-overlay"
      />

      <div className="container relative mx-auto grid max-w-7xl grid-cols-1 gap-16 px-4 py-32 lg:grid-cols-12 lg:gap-20 lg:py-44">
        <div className="flex flex-col justify-center lg:col-span-5">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mb-8 text-[0.7rem] uppercase tracking-[0.3em] text-rose-300/80 md:mb-10"
          >
            Begin your{" "}
            <span className="font-arabic font-medium not-italic">زفّة</span>
          </motion.p>

          <h2 className="font-display text-balance text-[clamp(2.75rem,6.5vw,5rem)] font-light leading-[0.98] tracking-tight">
            <SplitText>Tell us about</SplitText>
            <br />
            <span className="italic text-zinc-400">
              <SplitText delay={0.25}>your day.</SplitText>
            </span>
          </h2>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 max-w-md text-pretty text-base text-zinc-400 md:text-lg"
          >
            Share a few details and a planner will be in touch within 24 hours
            with a hand-picked shortlist that fits your style and budget.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-zinc-400"
          >
            <span className="inline-flex items-center gap-2">
              <span className="h-1 w-4 rounded-full bg-gradient-to-r from-rose-500 to-amber-400" />
              No spam, ever
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-1 w-4 rounded-full bg-gradient-to-r from-rose-500 to-amber-400" />
              Reply within 24 hours
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-1 w-4 rounded-full bg-gradient-to-r from-rose-500 to-amber-400" />
              Free, no commitment
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.7 }}
            className="mt-10 text-sm text-zinc-500"
          >
            Or{" "}
            <Link
              href="/venue-designer"
              className="font-medium text-zinc-100 underline-offset-4 hover:underline"
            >
              design your venue first
            </Link>
            {" — "}
            <Link
              href="/auth/signup"
              className="font-medium text-zinc-100 underline-offset-4 hover:underline"
            >
              create a free account
            </Link>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="relative lg:col-span-7"
        >
          <form
            onSubmit={handleSubmit}
            className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur-md md:p-10"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent"
            />

            <div className="relative grid grid-cols-1 gap-x-6 gap-y-7 md:grid-cols-2">
              <Field
                label="Your name"
                value={form.name}
                onChange={(v) => update("name", v)}
                index={0}
                required
                autoComplete="name"
              />

              <Field
                label="Email"
                type="email"
                value={form.email}
                onChange={(v) => update("email", v)}
                index={1}
                required
                autoComplete="email"
              />

              <SelectField
                label="Event type"
                value={form.eventType}
                onChange={(v) => update("eventType", v)}
                options={EVENT_TYPES}
                index={2}
                required
              />

              <Field
                label="Approx. date"
                type="date"
                value={form.date}
                onChange={(v) => update("date", v)}
                index={3}
              />

              <SelectField
                label="Guests"
                value={form.guests}
                onChange={(v) => update("guests", v)}
                options={GUEST_RANGES}
                index={4}
                className="md:col-span-2"
              />

              <TextareaField
                label="Tell us about your vision"
                value={form.message}
                onChange={(v) => update("message", v)}
                index={5}
                className="md:col-span-2"
              />
            </div>

            <div className="relative mt-10 flex flex-col items-center justify-between gap-4 sm:flex-row">
              <p className="text-xs text-zinc-500">
                By submitting, you agree to our{" "}
                <Link
                  href="/privacy"
                  className="text-zinc-300 underline-offset-4 hover:underline"
                >
                  privacy policy
                </Link>
                .
              </p>
              <Button
                type="submit"
                size="lg"
                disabled={submitting || submitted}
                className="group h-12 w-full gap-2 bg-white px-8 text-base text-zinc-950 hover:bg-zinc-100 disabled:opacity-90 sm:w-auto"
              >
                {submitted ? (
                  <>
                    <Check className="h-4 w-4" />
                    Sent
                  </>
                ) : submitting ? (
                  <>
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-950/30 border-t-zinc-950" />
                    Sending...
                  </>
                ) : (
                  <>
                    Send to a planner
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </section>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  index: number;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  className?: string;
}

function Field({
  label,
  value,
  onChange,
  index,
  type = "text",
  required,
  autoComplete,
  className,
}: FieldProps) {
  const id = `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{
        duration: 0.7,
        delay: 0.15 + index * 0.05,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={`group relative ${className ?? ""}`}
    >
      <label
        htmlFor={id}
        className="block text-[0.65rem] uppercase tracking-[0.25em] text-zinc-400"
      >
        {label}
        {required && <span className="ml-1 text-rose-300">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="peer mt-2 w-full border-b border-white/15 bg-transparent pb-2.5 text-base text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-white/60"
      />
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-gradient-to-r from-rose-400 to-amber-300 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] peer-focus:scale-x-100"
      />
    </motion.div>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  index: number;
  required?: boolean;
  className?: string;
}

function SelectField({
  label,
  value,
  onChange,
  options,
  index,
  required,
  className,
}: SelectFieldProps) {
  const id = `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{
        duration: 0.7,
        delay: 0.15 + index * 0.05,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={`group relative ${className ?? ""}`}
    >
      <label
        htmlFor={id}
        className="block text-[0.65rem] uppercase tracking-[0.25em] text-zinc-400"
      >
        {label}
        {required && <span className="ml-1 text-rose-300">*</span>}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          className="peer mt-2 w-full appearance-none border-b border-white/15 bg-transparent pb-2.5 pr-8 text-base text-white outline-none transition-colors focus:border-white/60 [&>option]:bg-zinc-950"
        >
          <option value="" disabled className="text-zinc-500">
            Choose...
          </option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute right-0 top-1/2 mt-1 h-4 w-4 -translate-y-1/2 text-zinc-400"
        >
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-gradient-to-r from-rose-400 to-amber-300 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] peer-focus:scale-x-100"
      />
    </motion.div>
  );
}

interface TextareaFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  index: number;
  className?: string;
}

function TextareaField({
  label,
  value,
  onChange,
  index,
  className,
}: TextareaFieldProps) {
  const id = `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{
        duration: 0.7,
        delay: 0.15 + index * 0.05,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={`group relative ${className ?? ""}`}
    >
      <label
        htmlFor={id}
        className="block text-[0.65rem] uppercase tracking-[0.25em] text-zinc-400"
      >
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Garden ceremony at sunset, warm ivory and rose, around 200 guests..."
        className="peer mt-2 w-full resize-none border-b border-white/15 bg-transparent pb-2.5 text-base text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-white/60"
      />
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-gradient-to-r from-rose-400 to-amber-300 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] peer-focus:scale-x-100"
      />
    </motion.div>
  );
}
