"use client";

import { useRef } from "react";
import { TomorrowTask, generateId } from "@/lib/types";

interface TomorrowTasksProps {
  tasks: TomorrowTask[];
  onChange: (tasks: TomorrowTask[]) => void;
}

function TimeInput({
  value,
  onChange,
  onComplete,
}: {
  value: string;
  onChange: (time: string) => void;
  onComplete: () => void;
}) {
  const minuteRef = useRef<HTMLInputElement>(null);
  const parts = value ? value.split(":") : [];
  const hour = parts[0] || "";
  const minute = parts[1] || "";

  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 2);
    const num = parseInt(val);
    if (val === "" || (num >= 0 && num <= 23)) {
      onChange(val ? val + ":" + minute : "");
      if (val.length === 2 || (val.length === 1 && num > 2)) {
        minuteRef.current?.focus();
      }
    }
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 2);
    const num = parseInt(val);
    if (val === "" || (num >= 0 && num <= 59)) {
      onChange(hour + ":" + val);
      if (val.length === 2) {
        onComplete();
      }
    }
  };

  const handleHourKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ":" || e.key === "Tab") {
      e.preventDefault();
      minuteRef.current?.focus();
    }
  };

  const handleMinuteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !minute) {
      e.preventDefault();
      const hourInput = (e.target as HTMLInputElement).previousElementSibling?.previousElementSibling as HTMLInputElement;
      hourInput?.focus();
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      onComplete();
    }
  };

  return (
    <div className="flex items-center text-foreground/40 ml-1">
      <input
        type="text"
        value={hour}
        onChange={handleHourChange}
        onKeyDown={handleHourKeyDown}
        placeholder="--"
        className="w-5 bg-transparent outline-none text-center placeholder:text-foreground/20"
        maxLength={2}
      />
      <span>:</span>
      <input
        ref={minuteRef}
        type="text"
        value={minute}
        onChange={handleMinuteChange}
        onKeyDown={handleMinuteKeyDown}
        placeholder="--"
        className="w-5 bg-transparent outline-none text-center placeholder:text-foreground/20"
        maxLength={2}
      />
    </div>
  );
}

export function TomorrowTasks({ tasks, onChange }: TomorrowTasksProps) {
  const handleTimeChange = (id: string, time: string) => {
    onChange(tasks.map((t) => (t.id === id ? { ...t, time } : t)));
  };

  const handleTextChange = (id: string, text: string) => {
    onChange(tasks.map((t) => (t.id === id ? { ...t, text } : t)));
  };

  const focusTextInput = (index: number) => {
    const inputs = document.querySelectorAll<HTMLInputElement>("[data-tomorrow-text]");
    inputs[index]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const newTask: TomorrowTask = { id: generateId(), text: "", time: "" };
      const newTasks = [...tasks];
      newTasks.splice(index + 1, 0, newTask);
      onChange(newTasks);
      setTimeout(() => focusTextInput(index + 1), 0);
    } else if (e.key === "Backspace" && tasks[index].text === "") {
      if (tasks.length > 1) {
        e.preventDefault();
        const newTasks = tasks.filter((_, i) => i !== index);
        onChange(newTasks);
        setTimeout(() => focusTextInput(Math.max(0, index - 1)), 0);
      } else if (index === 0) {
        e.preventDefault();
        onChange([]);
      }
    }
  };

  const handleStartTyping = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key.length === 1 && e.key !== "-") {
      e.preventDefault();
      onChange([{ id: generateId(), time: "", text: e.key }]);
      setTimeout(() => focusTextInput(0), 0);
    } else if (e.key === "Enter" || e.key === "-") {
      e.preventDefault();
      onChange([{ id: generateId(), time: "", text: "" }]);
      setTimeout(() => focusTextInput(0), 0);
    }
  };

  const handleClick = () => {
    if (tasks.length === 0) {
      onChange([{ id: generateId(), time: "", text: "" }]);
      setTimeout(() => focusTextInput(0), 0);
    }
  };

  if (tasks.length === 0) {
    return (
      <div
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleStartTyping}
        className="text-sm font-mono text-foreground/20 cursor-text outline-none"
      >
        - ...
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {tasks.map((task, index) => (
        <div key={task.id} className="flex items-center gap-1 text-sm font-mono">
          <div className="group flex items-center">
            <span className="text-foreground/30 cursor-default">-</span>
            {task.time ? (
              <TimeInput
                value={task.time}
                onChange={(time) => handleTimeChange(task.id, time)}
                onComplete={() => focusTextInput(index)}
              />
            ) : (
              <div className="w-0 overflow-hidden group-hover:w-auto group-focus-within:w-auto transition-all">
                <TimeInput
                  value={task.time}
                  onChange={(time) => handleTimeChange(task.id, time)}
                  onComplete={() => focusTextInput(index)}
                />
              </div>
            )}
          </div>
          <input
            data-tomorrow-text
            type="text"
            value={task.text}
            onChange={(e) => handleTextChange(task.id, e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            placeholder="..."
            className="flex-1 bg-transparent outline-none placeholder:text-foreground/20"
          />
        </div>
      ))}
    </div>
  );
}
