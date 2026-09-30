import { createContext, useContext } from "react";

export type AppLang = "en" | "am";
export type AppCalendar = "gregorian" | "ethiopian";

export type LangContextValue = {
  lang: AppLang;
  setLang: (lang: AppLang) => void;
  calendar: AppCalendar;
  setCalendar: (calendar: AppCalendar) => void;
};

export const LangContext = createContext<LangContextValue>({
  lang: "en",
  setLang: () => {},
  calendar: "gregorian",
  setCalendar: () => {},
});

export const useLang = () => useContext(LangContext).lang;
export const useSetLang = () => useContext(LangContext).setLang;
export const useCalendar = () => useContext(LangContext).calendar;
export const useSetCalendar = () => useContext(LangContext).setCalendar;
