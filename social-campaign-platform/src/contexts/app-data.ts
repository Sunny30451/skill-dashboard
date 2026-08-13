import { createContext, useContext } from "react";
import type {
  Agent,
  AppSettings,
  Campaign,
  ChatMessage,
  Credential,
  MediaFile,
  Milestone,
  Participant,
  Phase,
  SocialMediaAccount,
  SocialMediaPost,
  User,
  Workflow,
  WorkflowRun,
  WorkPackage,
} from "../types";

export interface AppDataState {
  users: User[];
  campaigns: Campaign[];
  phases: Phase[];
  milestones: Milestone[];
  workPackages: WorkPackage[];
  socialMediaAccounts: SocialMediaAccount[];
  socialMediaPosts: SocialMediaPost[];
  mediaFiles: MediaFile[];
  agents: Agent[];
  workflows: Workflow[];
  participants: Participant[];
  chatMessages: ChatMessage[];
  credentials: Credential[];
  workflowRuns: WorkflowRun[];
  settings: AppSettings;
}

export type NewCampaign = Omit<Campaign, "id" | "createdAt" | "updatedAt">;
export type NewPhase = Omit<Phase, "id">;
export type NewMilestone = Omit<Milestone, "id">;
export type NewWorkPackage = Omit<
  WorkPackage,
  "id" | "createdAt" | "updatedAt"
>;
export type NewMediaFile = Omit<MediaFile, "id" | "createdAt">;
export type NewAgent = Omit<Agent, "id" | "createdAt" | "updatedAt">;
export type NewWorkflow = Omit<Workflow, "id" | "createdAt" | "updatedAt">;
export type NewParticipant = Omit<Participant, "id">;
export type NewCredential = Omit<Credential, "id" | "createdAt" | "updatedAt">;
export type NewSocialMediaAccount = Omit<
  SocialMediaAccount,
  "id" | "createdAt" | "updatedAt"
>;
export type NewUser = Omit<User, "id" | "createdAt" | "updatedAt">;

export interface AppDataContextValue extends AppDataState {
  createCampaign: (input: NewCampaign) => Campaign;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void;
  deleteCampaign: (id: string) => void;
  createPhase: (input: NewPhase) => Phase;
  updatePhase: (id: string, patch: Partial<Phase>) => void;
  deletePhase: (id: string) => void;
  createMilestone: (input: NewMilestone) => Milestone;
  updateMilestone: (id: string, patch: Partial<Milestone>) => void;
  deleteMilestone: (id: string) => void;
  createWorkPackage: (input: NewWorkPackage) => WorkPackage;
  updateWorkPackage: (id: string, patch: Partial<WorkPackage>) => void;
  deleteWorkPackage: (id: string) => void;
  createMediaFile: (input: NewMediaFile) => MediaFile;
  deleteMediaFile: (id: string) => void;
  importMediaFile: (file: MediaFile) => void;
  createAgent: (input: NewAgent) => Agent;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  deleteAgent: (id: string) => void;
  createWorkflow: (input: NewWorkflow) => Workflow;
  updateWorkflow: (id: string, patch: Partial<Workflow>) => void;
  deleteWorkflow: (id: string) => void;
  runWorkflow: (id: string) => Promise<WorkflowRun>;
  inviteParticipant: (input: NewParticipant) => Participant;
  updateParticipant: (id: string, patch: Partial<Participant>) => void;
  deleteParticipant: (id: string) => void;
  sendMessage: (
    content: string,
    sender: User,
    conversationId?: string,
  ) => ChatMessage;
  chatWithAgent: (
    agentId: string,
    conversationId: string,
    prompt: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
  ) => Promise<ChatMessage>;
  createCredential: (input: NewCredential) => Credential;
  deleteCredential: (id: string) => void;
  createSocialMediaAccount: (
    input: NewSocialMediaAccount,
  ) => SocialMediaAccount;
  updateSocialMediaAccount: (
    id: string,
    patch: Partial<SocialMediaAccount>,
  ) => void;
  deleteSocialMediaAccount: (id: string) => void;
  createUser: (input: NewUser) => User;
  updateUser: (id: string, patch: Partial<User>) => void;
  deleteUser: (id: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetDemoData: () => void;
}

export const AppDataContext = createContext<AppDataContextValue | undefined>(
  undefined,
);

export function useAppData(): AppDataContextValue {
  const context = useContext(AppDataContext);
  if (!context)
    throw new Error("useAppData must be used within AppDataProvider");
  return context;
}
