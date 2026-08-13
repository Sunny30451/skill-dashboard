// User Roles
export type UserRole = "Admin" | "Worker" | "Visitor" | "Agent";

// Task Status
export type TaskStatus = "planned" | "in_progress" | "blocker" | "finished";

// User Interface
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  campaignRole?: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Campaign Interfaces
export interface Campaign {
  id: string;
  name: string;
  description: string;
  status: "planning" | "active" | "paused" | "completed" | "archived";
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Phase {
  id: string;
  campaignId: string;
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  status: "upcoming" | "current" | "completed";
  order: number;
}

export interface Milestone {
  id: string;
  phaseId: string;
  name: string;
  description?: string;
  dueDate: Date;
  status: "pending" | "in_progress" | "completed" | "blocked";
  order: number;
}

export interface WorkPackage {
  id: string;
  milestoneId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeId?: string;
  assigneeType: "user" | "agent";
  priority: "low" | "medium" | "high" | "critical";
  dueDate?: Date;
  estimatedHours?: number;
  actualHours?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Social Media Interfaces
export interface SocialMediaAccount {
  id: string;
  platform: string;
  name: string;
  email: string;
  url: string;
  apiEndpoint?: string;
  connectionStatus: "connected" | "disconnected" | "error";
  isActive: boolean;
  campaignIds: string[];
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialMediaPost {
  id: string;
  accountId: string;
  platform: string;
  content: string;
  mediaUrls?: string[];
  postedAt: Date;
  likes?: number;
  shares?: number;
  comments?: number;
  engagement?: number;
}

// Media Library
export interface MediaFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  uploadedBy?: string;
  campaignId?: string;
  tags?: string[];
  createdAt: Date;
}

// Agent & Workflow Interfaces
export interface Agent {
  id: string;
  name: string;
  type: string;
  description?: string;
  isActive: boolean;
  capabilities: string[];
  configuration: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  triggerType: "manual" | "scheduled" | "event";
  schedule?: string; // cron expression
  isActive: boolean;
  campaignId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowStep {
  id: string;
  order: number;
  action: string;
  agentId?: string;
  parameters: Record<string, unknown>;
  condition?: string;
}

// AI/KI Settings
export interface AISettings {
  id: string;
  provider: "ollama" | "cloud";
  endpoint: string;
  apiKeyConfigured: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
  isActive: boolean;
  updatedAt: Date;
}

// System Settings
export interface SystemSettings {
  id: string;
  key: string;
  value: string;
  category: "general" | "ai" | "workflow" | "security";
  description?: string;
  updatedAt: Date;
}

// Contact/Participant
export interface Participant {
  id: string;
  userId?: string;
  agentId?: string;
  name: string;
  email?: string;
  role: string;
  campaignIds: string[];
  avatar?: string;
  status?: "active" | "invited" | "inactive";
}

// Chat Message
export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  isSystem?: boolean;
  conversationId?: string;
}

// Credential Storage
export interface Credential {
  id: string;
  userId: string;
  service: string;
  username: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppSettings {
  aiProvider: "ollama" | "cloud";
  aiModel: string;
  aiEndpoint: string;
  apiKeyConfigured: boolean;
  socialSyncEnabled: boolean;
  workflowEngineEnabled: boolean;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "running" | "completed" | "failed";
  startedAt: Date;
  completedAt?: Date;
  message?: string;
  stepResults?: WorkflowStepResult[];
}

export interface WorkflowStepResult {
  stepId: string;
  action: string;
  agentId?: string;
  status: "running" | "completed" | "failed" | "skipped";
  startedAt: Date;
  completedAt?: Date;
  output?: string;
  error?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalDurationMs?: number;
}
