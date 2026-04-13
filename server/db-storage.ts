import { eq, and, desc, asc, isNull, lt, lte, inArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import * as schema from "@shared/schema";
import { 
  type User, type InsertUser, 
  type Printer, type InsertPrinter,
  type Customer, type InsertCustomer,
  type Location, type InsertLocation,
  type Event, type InsertEvent,
  type BadgeTemplate, type InsertBadgeTemplate,
  type CustomerIntegration, type InsertCustomerIntegration,
  type EventIntegration, type InsertEventIntegration,
  type Attendee, type InsertAttendee,
  type IntegrationConnection, type InsertIntegrationConnection,
  type StoredCredential, type InsertStoredCredential,
  type IntegrationProvider,
  type IntegrationEndpointConfig, type InsertIntegrationEndpointConfig,
  type EventCodeMapping, type InsertEventCodeMapping,
  type SessionCodeMapping, type InsertSessionCodeMapping,
  type Session, type InsertSession,
  type SessionRegistration, type InsertSessionRegistration,
  type SessionCheckin, type InsertSessionCheckin,
  type CustomFont, type InsertCustomFont,
  type StaffSession, type InsertStaffSession,
  type StaffActivityLog, type InsertStaffActivityLog,
  type EventBadgeTemplateOverride, type InsertEventBadgeTemplateOverride,
  type SyncJob, type InsertSyncJob,
  type EventWorkflowConfig, type InsertEventWorkflowConfig,
  type EventWorkflowStep, type InsertEventWorkflowStep,
  type EventBuyerQuestion, type InsertEventBuyerQuestion,
  type EventDisclaimer, type InsertEventDisclaimer,
  type AttendeeWorkflowResponse, type InsertAttendeeWorkflowResponse,
  type AttendeeSignature, type InsertAttendeeSignature,
  type EventWorkflowWithSteps, type WorkflowStepWithData,
  type EventSyncState, type InsertEventSyncState,
  type SyncLog, type InsertSyncLog,
  type SystemSetting, type InsertSystemSetting,
  type EventConfigurationTemplate, type InsertEventConfigurationTemplate,
  type EventNotificationRule, type InsertEventNotificationRule,
  type UserActivity, type InsertUserActivity,
  type UserPresence,
  type ApplicationError, type InsertApplicationError,
  type AdminAuditLog, type InsertAdminAuditLog,
  type FeatureFlag, type InsertFeatureFlag,
  type DataRetentionPolicy, type DataRetentionLog, type InsertDataRetentionLog,
} from "@shared/schema";
import { IStorage } from "./storage";
import { randomUUID, randomBytes } from "crypto";

function generateId(prefix: string): string {
  return `${prefix}-${randomUUID().substring(0, 8)}`;
}

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    return user;
  }

  async getUserByPhoneNumber(phoneNumber: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.phoneNumber, phoneNumber)).limit(1);
    return user;
  }

  async getUsersByCustomer(customerId: string): Promise<User[]> {
    return db.select().from(schema.users).where(eq(schema.users.customerId, customerId));
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(schema.users);
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = generateId("user");
    const [created] = await db.insert(schema.users).values({ ...user, id }).returning();
    return created;
  }

  async updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(schema.users).set(user).where(eq(schema.users.id, id)).returning();
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(schema.users).where(eq(schema.users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async updateLastLogin(id: string): Promise<void> {
    await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, id));
  }

  async updateUserPassword(id: string, passwordHash: string): Promise<void> {
    await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, id));
  }

  async createPasswordResetToken(userId: string, expiresInHours: number = 48, resetCodeHash?: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    const id = generateId("prt");
    
    await db.insert(schema.passwordResetTokens).values({
      id,
      userId,
      token,
      expiresAt,
      resetCodeHash: resetCodeHash || null,
      attempts: 0,
    });
    
    return { token, expiresAt };
  }

  async getPasswordResetToken(token: string): Promise<{ userId: string; expiresAt: Date; usedAt: Date | null; resetCodeHash: string | null; attempts: number } | undefined> {
    const [result] = await db.select({
      userId: schema.passwordResetTokens.userId,
      expiresAt: schema.passwordResetTokens.expiresAt,
      usedAt: schema.passwordResetTokens.usedAt,
      resetCodeHash: schema.passwordResetTokens.resetCodeHash,
      attempts: schema.passwordResetTokens.attempts,
    }).from(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.token, token)).limit(1);
    return result;
  }

  async getPasswordResetTokenByUserId(userId: string): Promise<{ token: string; expiresAt: Date; usedAt: Date | null; resetCodeHash: string | null; attempts: number } | undefined> {
    const [result] = await db.select({
      token: schema.passwordResetTokens.token,
      expiresAt: schema.passwordResetTokens.expiresAt,
      usedAt: schema.passwordResetTokens.usedAt,
      resetCodeHash: schema.passwordResetTokens.resetCodeHash,
      attempts: schema.passwordResetTokens.attempts,
    }).from(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.userId, userId),
          isNull(schema.passwordResetTokens.usedAt),
          sql`${schema.passwordResetTokens.expiresAt} > NOW()`
        )
      )
      .orderBy(desc(schema.passwordResetTokens.createdAt))
      .limit(1);
    return result;
  }

  async getPasswordResetTokensForUser(userId: string): Promise<{ token: string; expiresAt: Date; codeHash: string | null }[]> {
    const results = await db.select({
      token: schema.passwordResetTokens.token,
      expiresAt: schema.passwordResetTokens.expiresAt,
      codeHash: schema.passwordResetTokens.resetCodeHash,
    }).from(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.userId, userId),
          isNull(schema.passwordResetTokens.usedAt),
          sql`${schema.passwordResetTokens.expiresAt} > NOW()`
        )
      );
    return results;
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    await db.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.token, token));
  }

  async incrementPasswordResetAttempts(token: string): Promise<number> {
    const [result] = await db.update(schema.passwordResetTokens)
      .set({ attempts: sql`${schema.passwordResetTokens.attempts} + 1` })
      .where(eq(schema.passwordResetTokens.token, token))
      .returning({ attempts: schema.passwordResetTokens.attempts });
    return result?.attempts ?? 0;
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    await db.update(schema.passwordResetTokens).set({ usedAt: new Date() }).where(eq(schema.passwordResetTokens.token, token));
  }

  async deleteExpiredPasswordResetTokens(): Promise<number> {
    const result = await db.delete(schema.passwordResetTokens).where(
      sql`${schema.passwordResetTokens.expiresAt} < NOW() OR ${schema.passwordResetTokens.usedAt} IS NOT NULL`
    );
    return result.rowCount ?? 0;
  }

  async upsertUser(userData: { id: string; email?: string; firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null }): Promise<User> {
    // First check by ID
    const existingById = await this.getUser(userData.id);
    if (existingById) {
      const updated = await this.updateUser(userData.id, {
        email: userData.email || existingById.email,
        firstName: userData.firstName ?? existingById.firstName,
        lastName: userData.lastName ?? existingById.lastName,
      });
      return updated!;
    }
    
    // Also check by email to prevent duplicate email constraint violation
    if (userData.email) {
      const existingByEmail = await this.getUserByEmail(userData.email);
      if (existingByEmail) {
        // Update the existing user with the new ID info
        const updated = await this.updateUser(existingByEmail.id, {
          firstName: userData.firstName ?? existingByEmail.firstName,
          lastName: userData.lastName ?? existingByEmail.lastName,
        });
        return updated!;
      }
    }
    
    const allUsers = await this.getAllUsers();
    const role = allUsers.length === 0 ? 'super_admin' : 'staff';
    
    return this.createUser({
      email: userData.email || `user-${userData.id}@example.com`,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: role as any,
      isActive: true,
      customerId: null,
    });
  }

  async getCustomers(): Promise<Customer[]> {
    return db.select().from(schema.customers).orderBy(asc(schema.customers.name));
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, id)).limit(1);
    return customer;
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const id = generateId("cust");
    const templateId = generateId("tpl");
    
    // Use a transaction to ensure atomicity - both customer and default template are created together
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.customers).values({ ...customer, id }).returning();
      
      // Create a default "Standard Event Badge" template for the new customer
      await tx.insert(schema.badgeTemplates).values({
        id: templateId,
        customerId: id,
        name: "Standard Event Badge",
        participantType: "General",
        participantTypes: ["General", "VIP", "Speaker", "Staff", "Sponsor", "Press"],
        backgroundColor: "#ffffff",
        textColor: "#1a1a1a",
        accentColor: "#3b82f6",
        width: 4,
        height: 3,
        includeQR: true,
        qrPosition: "bottom-right",
        fontFamily: "Inter",
        mergeFields: [
          { field: "firstName", label: "First Name", fontSize: 36, position: { x: 50, y: 25 }, align: "center", fontWeight: "bold" },
          { field: "lastName", label: "Last Name", fontSize: 28, position: { x: 50, y: 45 }, align: "center", fontWeight: "normal" },
          { field: "company", label: "Company", fontSize: 18, position: { x: 50, y: 62 }, align: "center", fontWeight: "normal" },
          { field: "title", label: "Title", fontSize: 14, position: { x: 50, y: 75 }, align: "center", fontWeight: "normal" }
        ],
        qrCodeConfig: { embedType: "externalId", fields: ["externalId", "email"], separator: "|", includeLabel: false }
      } as any);
      
      return created;
    });
  }

  async updateCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [updated] = await db.update(schema.customers).set(customer).where(eq(schema.customers.id, id)).returning();
    return updated;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    const result = await db.delete(schema.customers).where(eq(schema.customers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Location methods
  async getLocations(customerId: string): Promise<Location[]> {
    return db.select().from(schema.locations).where(eq(schema.locations.customerId, customerId));
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const [location] = await db.select().from(schema.locations).where(eq(schema.locations.id, id)).limit(1);
    return location;
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const id = generateId("loc");
    const [created] = await db.insert(schema.locations).values({ ...location, id } as any).returning();
    return created;
  }

  async updateLocation(id: string, location: Partial<InsertLocation>): Promise<Location | undefined> {
    const [updated] = await db.update(schema.locations).set(location as any).where(eq(schema.locations.id, id)).returning();
    return updated;
  }

  async deleteLocation(id: string): Promise<boolean> {
    const result = await db.delete(schema.locations).where(eq(schema.locations.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async matchLocationByName(customerId: string, locationName: string): Promise<Location | undefined> {
    if (!locationName) return undefined;
    const normalizedName = locationName.toLowerCase().trim();
    
    // First try exact match on name
    const locations = await db.select().from(schema.locations)
      .where(eq(schema.locations.customerId, customerId));
    
    for (const loc of locations) {
      // Exact name match
      if (loc.name.toLowerCase().trim() === normalizedName) {
        return loc;
      }
      // Check match patterns
      const patterns = (loc.matchPatterns || []) as string[];
      for (const pattern of patterns) {
        if (normalizedName.includes(pattern.toLowerCase()) || pattern.toLowerCase().includes(normalizedName)) {
          return loc;
        }
      }
    }
    return undefined;
  }

  async getAllEvents(): Promise<Event[]> {
    return db.select().from(schema.events).orderBy(desc(schema.events.eventDate));
  }

  async getEvents(customerId: string): Promise<Event[]> {
    return db.select().from(schema.events).where(eq(schema.events.customerId, customerId)).orderBy(desc(schema.events.eventDate));
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const [event] = await db.select().from(schema.events).where(eq(schema.events.id, id)).limit(1);
    return event;
  }

  async getEventByExternalId(customerId: string, externalEventId: string): Promise<Event | undefined> {
    const [event] = await db.select().from(schema.events)
      .where(and(
        eq(schema.events.customerId, customerId),
        eq(schema.events.externalEventId, externalEventId)
      ))
      .limit(1);
    return event;
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const id = generateId("evt");
    const [created] = await db.insert(schema.events).values({ ...event, id } as any).returning();
    return created;
  }

  async updateEvent(id: string, event: Partial<InsertEvent>): Promise<Event | undefined> {
    const [updated] = await db.update(schema.events).set(event as any).where(eq(schema.events.id, id)).returning();
    return updated;
  }

  async deleteEvent(id: string): Promise<boolean> {
    const result = await db.delete(schema.events).where(eq(schema.events.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async upsertEventFromSync(
    customerId: string, 
    integrationId: string, 
    eventData: { 
      externalEventId: string; 
      name: string; 
      eventDate: Date; 
      startDate?: Date | null;
      endDate?: Date | null;
      accountCode?: string | null;
      eventCode?: string | null;
      timezone?: string | null;
      status?: string;
      location?: string | null;
      venue?: string | null;
    }
  ): Promise<{ event: Event; created: boolean }> {
    const existing = await this.getEventByExternalId(customerId, eventData.externalEventId);
    
    if (existing) {
      const updated = await this.updateEvent(existing.id, {
        name: eventData.name,
        eventDate: eventData.eventDate,
        startDate: eventData.startDate ?? existing.startDate,
        endDate: eventData.endDate ?? existing.endDate,
        accountCode: eventData.accountCode ?? existing.accountCode,
        eventCode: eventData.eventCode ?? existing.eventCode,
        timezone: eventData.timezone ?? existing.timezone,
        status: eventData.status || existing.status,
        integrationId: integrationId || existing.integrationId,
        location: eventData.location ?? existing.location,
        venue: eventData.venue ?? existing.venue,
      });
      return { event: updated!, created: false };
    }
    
    const created = await this.createEvent({
      customerId,
      name: eventData.name,
      eventDate: eventData.eventDate,
      startDate: eventData.startDate,
      endDate: eventData.endDate,
      accountCode: eventData.accountCode,
      eventCode: eventData.eventCode,
      timezone: eventData.timezone,
      integrationId,
      externalEventId: eventData.externalEventId,
      status: eventData.status || 'upcoming',
      location: eventData.location,
      venue: eventData.venue,
    });
    return { event: created, created: true };
  }

  async getBadgeTemplates(customerId: string): Promise<BadgeTemplate[]> {
    return db.select().from(schema.badgeTemplates).where(eq(schema.badgeTemplates.customerId, customerId));
  }

  async getBadgeTemplate(id: string): Promise<BadgeTemplate | undefined> {
    const [template] = await db.select().from(schema.badgeTemplates).where(eq(schema.badgeTemplates.id, id)).limit(1);
    return template;
  }

  async createBadgeTemplate(template: InsertBadgeTemplate): Promise<BadgeTemplate> {
    const id = generateId("tpl");
    const [created] = await db.insert(schema.badgeTemplates).values({ ...template, id } as any).returning();
    return created;
  }

  async updateBadgeTemplate(id: string, template: Partial<InsertBadgeTemplate>): Promise<BadgeTemplate | undefined> {
    const [updated] = await db.update(schema.badgeTemplates).set(template as any).where(eq(schema.badgeTemplates.id, id)).returning();
    return updated;
  }

  async deleteBadgeTemplate(id: string): Promise<boolean> {
    const result = await db.delete(schema.badgeTemplates).where(eq(schema.badgeTemplates.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Event Configuration Template methods
  async getEventConfigurationTemplates(customerId: string): Promise<EventConfigurationTemplate[]> {
    return db.select().from(schema.eventConfigurationTemplates)
      .where(eq(schema.eventConfigurationTemplates.customerId, customerId))
      .orderBy(desc(schema.eventConfigurationTemplates.createdAt));
  }

  async getEventConfigurationTemplate(id: string): Promise<EventConfigurationTemplate | undefined> {
    const [template] = await db.select().from(schema.eventConfigurationTemplates)
      .where(eq(schema.eventConfigurationTemplates.id, id)).limit(1);
    return template;
  }

  async getDefaultEventConfigurationTemplate(customerId: string): Promise<EventConfigurationTemplate | undefined> {
    const [template] = await db.select().from(schema.eventConfigurationTemplates)
      .where(and(
        eq(schema.eventConfigurationTemplates.customerId, customerId),
        eq(schema.eventConfigurationTemplates.isDefault, true)
      )).limit(1);
    return template;
  }

  async createEventConfigurationTemplate(template: InsertEventConfigurationTemplate): Promise<EventConfigurationTemplate> {
    const id = generateId("ect");
    const [created] = await db.insert(schema.eventConfigurationTemplates)
      .values({ ...template, id })
      .returning();
    return created;
  }

  async updateEventConfigurationTemplate(id: string, template: Partial<InsertEventConfigurationTemplate>): Promise<EventConfigurationTemplate | undefined> {
    const [updated] = await db.update(schema.eventConfigurationTemplates)
      .set({ ...template, updatedAt: new Date() })
      .where(eq(schema.eventConfigurationTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteEventConfigurationTemplate(id: string): Promise<boolean> {
    const result = await db.delete(schema.eventConfigurationTemplates)
      .where(eq(schema.eventConfigurationTemplates.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getCustomerIntegrations(customerId: string): Promise<CustomerIntegration[]> {
    return db.select().from(schema.customerIntegrations).where(eq(schema.customerIntegrations.customerId, customerId));
  }

  async getCustomerIntegration(id: string): Promise<CustomerIntegration | undefined> {
    const [integration] = await db.select().from(schema.customerIntegrations).where(eq(schema.customerIntegrations.id, id)).limit(1);
    return integration;
  }

  async createCustomerIntegration(integration: InsertCustomerIntegration): Promise<CustomerIntegration> {
    const id = generateId("int");
    const [created] = await db.insert(schema.customerIntegrations).values({ ...integration, id } as any).returning();
    return created;
  }

  async updateCustomerIntegration(id: string, integration: Partial<InsertCustomerIntegration>): Promise<CustomerIntegration | undefined> {
    const [updated] = await db.update(schema.customerIntegrations).set(integration as any).where(eq(schema.customerIntegrations.id, id)).returning();
    return updated;
  }

  async deleteCustomerIntegration(id: string): Promise<boolean> {
    const result = await db.delete(schema.customerIntegrations).where(eq(schema.customerIntegrations.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSyncLogs(integrationId: string, limit: number = 50): Promise<SyncLog[]> {
    return db.select().from(schema.syncLogs)
      .where(eq(schema.syncLogs.integrationId, integrationId))
      .orderBy(desc(schema.syncLogs.startedAt))
      .limit(limit);
  }

  async getSyncLogsByCustomer(customerId: string, limit: number = 50): Promise<SyncLog[]> {
    return db.select().from(schema.syncLogs)
      .where(eq(schema.syncLogs.customerId, customerId))
      .orderBy(desc(schema.syncLogs.startedAt))
      .limit(limit);
  }

  async createSyncLog(log: InsertSyncLog): Promise<SyncLog> {
    const id = generateId("synclog");
    const [created] = await db.insert(schema.syncLogs).values({ ...log, id } as any).returning();
    return created;
  }

  async updateSyncLog(id: string, log: Partial<InsertSyncLog>): Promise<SyncLog | undefined> {
    const [updated] = await db.update(schema.syncLogs).set(log as any).where(eq(schema.syncLogs.id, id)).returning();
    return updated;
  }

  async getEventIntegrations(eventId: string): Promise<EventIntegration[]> {
    return db.select().from(schema.eventIntegrations).where(eq(schema.eventIntegrations.eventId, eventId));
  }

  async getEventIntegration(id: string): Promise<EventIntegration | undefined> {
    const [integration] = await db.select().from(schema.eventIntegrations).where(eq(schema.eventIntegrations.id, id)).limit(1);
    return integration;
  }

  async createEventIntegration(integration: InsertEventIntegration): Promise<EventIntegration> {
    const id = generateId("evtint");
    const [created] = await db.insert(schema.eventIntegrations).values({ ...integration, id }).returning();
    return created;
  }

  async updateEventIntegration(id: string, integration: Partial<InsertEventIntegration>): Promise<EventIntegration | undefined> {
    const [updated] = await db.update(schema.eventIntegrations).set(integration).where(eq(schema.eventIntegrations.id, id)).returning();
    return updated;
  }

  async deleteEventIntegration(id: string): Promise<boolean> {
    const result = await db.delete(schema.eventIntegrations).where(eq(schema.eventIntegrations.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getAttendees(eventId: string): Promise<Attendee[]> {
    return db.select().from(schema.attendees).where(eq(schema.attendees.eventId, eventId));
  }

  async getAttendeesByCustomer(customerId: string): Promise<Attendee[]> {
    const events = await this.getEvents(customerId);
    const eventIds = events.map(e => e.id);
    if (eventIds.length === 0) return [];
    return db.select().from(schema.attendees).where(inArray(schema.attendees.eventId, eventIds));
  }

  async getAttendee(id: string): Promise<Attendee | undefined> {
    const [attendee] = await db.select().from(schema.attendees).where(eq(schema.attendees.id, id)).limit(1);
    return attendee;
  }

  async getAttendeeByExternalId(eventId: string, externalId: string): Promise<Attendee | undefined> {
    const [attendee] = await db.select().from(schema.attendees)
      .where(and(
        eq(schema.attendees.eventId, eventId),
        eq(schema.attendees.externalId, externalId)
      ))
      .limit(1);
    return attendee;
  }

  async createAttendee(attendee: InsertAttendee): Promise<Attendee> {
    const id = generateId("att");
    const [created] = await db.insert(schema.attendees).values({ ...attendee, id } as any).returning();
    return created;
  }

  async updateAttendee(id: string, attendee: Partial<InsertAttendee>): Promise<Attendee | undefined> {
    const [updated] = await db.update(schema.attendees).set(attendee as any).where(eq(schema.attendees.id, id)).returning();
    return updated;
  }

  async deleteAttendee(id: string): Promise<boolean> {
    const result = await db.delete(schema.attendees).where(eq(schema.attendees.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getDistinctParticipantTypes(eventId: string): Promise<string[]> {
    const result = await db
      .selectDistinct({ participantType: schema.attendees.participantType })
      .from(schema.attendees)
      .where(eq(schema.attendees.eventId, eventId));
    return result.map(r => r.participantType).filter(Boolean).sort();
  }

  async getPrinters(customerId: string): Promise<Printer[]> {
    return db.select().from(schema.printers).where(eq(schema.printers.customerId, customerId));
  }

  async getPrinter(id: string): Promise<Printer | undefined> {
    const [printer] = await db.select().from(schema.printers).where(eq(schema.printers.id, id)).limit(1);
    return printer;
  }

  async createPrinter(printer: InsertPrinter): Promise<Printer> {
    const id = generateId("prt");
    const [created] = await db.insert(schema.printers).values({ ...printer, id } as any).returning();
    return created;
  }

  async updatePrinter(id: string, printer: Partial<InsertPrinter>): Promise<Printer | undefined> {
    const [updated] = await db.update(schema.printers).set(printer as any).where(eq(schema.printers.id, id)).returning();
    return updated;
  }

  async deletePrinter(id: string): Promise<boolean> {
    const result = await db.delete(schema.printers).where(eq(schema.printers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getIntegrationConnections(integrationId: string): Promise<IntegrationConnection[]> {
    return db.select().from(schema.integrationConnections).where(eq(schema.integrationConnections.integrationId, integrationId));
  }

  async getIntegrationConnection(id: string): Promise<IntegrationConnection | undefined> {
    const [connection] = await db.select().from(schema.integrationConnections).where(eq(schema.integrationConnections.id, id)).limit(1);
    return connection;
  }

  async getIntegrationConnectionByIntegration(integrationId: string): Promise<IntegrationConnection | undefined> {
    const [connection] = await db.select().from(schema.integrationConnections).where(eq(schema.integrationConnections.integrationId, integrationId)).limit(1);
    return connection;
  }

  async createIntegrationConnection(connection: InsertIntegrationConnection): Promise<IntegrationConnection> {
    const id = generateId("conn");
    const [created] = await db.insert(schema.integrationConnections).values({ ...connection, id }).returning();
    return created;
  }

  async updateIntegrationConnection(id: string, connection: Partial<InsertIntegrationConnection>): Promise<IntegrationConnection | undefined> {
    const [updated] = await db.update(schema.integrationConnections).set(connection).where(eq(schema.integrationConnections.id, id)).returning();
    return updated;
  }

  async deleteIntegrationConnection(id: string): Promise<boolean> {
    const result = await db.delete(schema.integrationConnections).where(eq(schema.integrationConnections.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getStoredCredentials(connectionId: string): Promise<StoredCredential[]> {
    return db.select().from(schema.storedCredentials).where(eq(schema.storedCredentials.connectionId, connectionId));
  }

  async getStoredCredential(id: string): Promise<StoredCredential | undefined> {
    const [credential] = await db.select().from(schema.storedCredentials).where(eq(schema.storedCredentials.id, id)).limit(1);
    return credential;
  }

  async getStoredCredentialByType(connectionId: string, credentialType: string): Promise<StoredCredential | undefined> {
    const [credential] = await db.select().from(schema.storedCredentials)
      .where(and(
        eq(schema.storedCredentials.connectionId, connectionId),
        eq(schema.storedCredentials.credentialType, credentialType),
        eq(schema.storedCredentials.isValid, true)
      ))
      .orderBy(desc(schema.storedCredentials.createdAt))
      .limit(1);
    return credential;
  }

  async createStoredCredential(credential: InsertStoredCredential): Promise<StoredCredential> {
    const id = generateId("cred");
    const [created] = await db.insert(schema.storedCredentials).values({ ...credential, id }).returning();
    return created;
  }

  async updateStoredCredential(id: string, credential: Partial<InsertStoredCredential>): Promise<StoredCredential | undefined> {
    const [updated] = await db.update(schema.storedCredentials).set(credential).where(eq(schema.storedCredentials.id, id)).returning();
    return updated;
  }

  async deleteStoredCredential(id: string): Promise<boolean> {
    const result = await db.delete(schema.storedCredentials).where(eq(schema.storedCredentials.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteStoredCredentialsByConnection(connectionId: string): Promise<boolean> {
    const result = await db.delete(schema.storedCredentials).where(eq(schema.storedCredentials.connectionId, connectionId));
    return (result.rowCount ?? 0) > 0;
  }

  async getIntegrationProviders(): Promise<IntegrationProvider[]> {
    // Return providers from static configuration (INTEGRATION_PROVIDERS in shared/integration-providers.ts)
    // transformed to match the IntegrationProvider database type
    const { INTEGRATION_PROVIDERS } = await import("../shared/integration-providers");
    return Object.values(INTEGRATION_PROVIDERS).map(spec => ({
      id: spec.id,
      name: spec.name,
      type: spec.authType,
      logoUrl: spec.logoUrl || null,
      authType: spec.authType,
      oauth2Config: spec.oauth2Config || null,
      defaultBaseUrl: spec.baseUrlTemplate || null,
      endpointTemplates: null,
      status: "active",
      createdAt: new Date(),
    }));
  }

  async getIntegrationProvider(id: string): Promise<IntegrationProvider | undefined> {
    const { INTEGRATION_PROVIDERS } = await import("../shared/integration-providers");
    const spec = INTEGRATION_PROVIDERS[id as keyof typeof INTEGRATION_PROVIDERS];
    if (!spec) return undefined;
    return {
      id: spec.id,
      name: spec.name,
      type: spec.authType,
      logoUrl: spec.logoUrl || null,
      authType: spec.authType,
      oauth2Config: spec.oauth2Config || null,
      defaultBaseUrl: spec.baseUrlTemplate || null,
      endpointTemplates: null,
      status: "active",
      createdAt: new Date(),
    };
  }

  async getIntegrationEndpointConfigs(integrationId: string): Promise<IntegrationEndpointConfig[]> {
    return db.select().from(schema.integrationEndpointConfigs).where(eq(schema.integrationEndpointConfigs.integrationId, integrationId));
  }

  async getIntegrationEndpointConfig(integrationId: string, dataType: string): Promise<IntegrationEndpointConfig | undefined> {
    const [config] = await db.select().from(schema.integrationEndpointConfigs)
      .where(and(eq(schema.integrationEndpointConfigs.integrationId, integrationId), eq(schema.integrationEndpointConfigs.dataType, dataType)))
      .limit(1);
    return config;
  }

  async getIntegrationEndpointConfigById(id: string): Promise<IntegrationEndpointConfig | undefined> {
    const [config] = await db.select().from(schema.integrationEndpointConfigs)
      .where(eq(schema.integrationEndpointConfigs.id, id))
      .limit(1);
    return config;
  }

  async createIntegrationEndpointConfig(config: InsertIntegrationEndpointConfig): Promise<IntegrationEndpointConfig> {
    const id = generateId("epc");
    const [created] = await db.insert(schema.integrationEndpointConfigs).values({ ...config, id } as any).returning();
    return created;
  }

  async updateIntegrationEndpointConfig(id: string, config: Partial<InsertIntegrationEndpointConfig>): Promise<IntegrationEndpointConfig | undefined> {
    const [updated] = await db.update(schema.integrationEndpointConfigs).set(config as any).where(eq(schema.integrationEndpointConfigs.id, id)).returning();
    return updated;
  }

  async deleteIntegrationEndpointConfig(id: string): Promise<boolean> {
    const result = await db.delete(schema.integrationEndpointConfigs).where(eq(schema.integrationEndpointConfigs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getEventCodeMappings(integrationId: string): Promise<EventCodeMapping[]> {
    return db.select().from(schema.eventCodeMappings).where(eq(schema.eventCodeMappings.integrationId, integrationId));
  }

  async getEventCodeMapping(id: string): Promise<EventCodeMapping | undefined> {
    const [mapping] = await db.select().from(schema.eventCodeMappings).where(eq(schema.eventCodeMappings.id, id)).limit(1);
    return mapping;
  }

  async getEventCodeMappingByExternalId(integrationId: string, externalEventId: string): Promise<EventCodeMapping | undefined> {
    const [mapping] = await db.select().from(schema.eventCodeMappings)
      .where(and(eq(schema.eventCodeMappings.integrationId, integrationId), eq(schema.eventCodeMappings.externalEventId, externalEventId)))
      .limit(1);
    return mapping;
  }

  async createEventCodeMapping(mapping: InsertEventCodeMapping): Promise<EventCodeMapping> {
    const id = generateId("ecm");
    const [created] = await db.insert(schema.eventCodeMappings).values({ ...mapping, id } as any).returning();
    return created;
  }

  async updateEventCodeMapping(id: string, mapping: Partial<InsertEventCodeMapping>): Promise<EventCodeMapping | undefined> {
    const [updated] = await db.update(schema.eventCodeMappings).set(mapping as any).where(eq(schema.eventCodeMappings.id, id)).returning();
    return updated;
  }

  async deleteEventCodeMapping(id: string): Promise<boolean> {
    const result = await db.delete(schema.eventCodeMappings).where(eq(schema.eventCodeMappings.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSessionCodeMappings(eventCodeMappingId: string): Promise<SessionCodeMapping[]> {
    return db.select().from(schema.sessionCodeMappings).where(eq(schema.sessionCodeMappings.eventCodeMappingId, eventCodeMappingId));
  }

  async getSessionCodeMapping(id: string): Promise<SessionCodeMapping | undefined> {
    const [mapping] = await db.select().from(schema.sessionCodeMappings).where(eq(schema.sessionCodeMappings.id, id)).limit(1);
    return mapping;
  }

  async createSessionCodeMapping(mapping: InsertSessionCodeMapping): Promise<SessionCodeMapping> {
    const id = generateId("scm");
    const [created] = await db.insert(schema.sessionCodeMappings).values({ ...mapping, id } as any).returning();
    return created;
  }

  async updateSessionCodeMapping(id: string, mapping: Partial<InsertSessionCodeMapping>): Promise<SessionCodeMapping | undefined> {
    const [updated] = await db.update(schema.sessionCodeMappings).set(mapping as any).where(eq(schema.sessionCodeMappings.id, id)).returning();
    return updated;
  }

  async deleteSessionCodeMapping(id: string): Promise<boolean> {
    const result = await db.delete(schema.sessionCodeMappings).where(eq(schema.sessionCodeMappings.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSessions(eventId: string): Promise<Session[]> {
    return db.select().from(schema.sessions).where(eq(schema.sessions.eventId, eventId)).orderBy(asc(schema.sessions.startTime));
  }

  async getSession(id: string): Promise<Session | undefined> {
    const [session] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).limit(1);
    return session;
  }

  async getSessionByExternalId(eventId: string, externalId: string): Promise<Session | undefined> {
    const [session] = await db.select().from(schema.sessions)
      .where(and(
        eq(schema.sessions.eventId, eventId),
        eq(schema.sessions.externalId, externalId)
      ))
      .limit(1);
    return session;
  }

  async createSession(session: InsertSession): Promise<Session> {
    const id = generateId("sess");
    const [created] = await db.insert(schema.sessions).values({ ...session, id } as any).returning();
    return created;
  }

  async updateSession(id: string, session: Partial<InsertSession>): Promise<Session | undefined> {
    const [updated] = await db.update(schema.sessions).set(session as any).where(eq(schema.sessions.id, id)).returning();
    return updated;
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSessionRegistrations(sessionId: string): Promise<SessionRegistration[]> {
    return db.select().from(schema.sessionRegistrations).where(eq(schema.sessionRegistrations.sessionId, sessionId));
  }

  async getSessionRegistration(id: string): Promise<SessionRegistration | undefined> {
    const [registration] = await db.select().from(schema.sessionRegistrations).where(eq(schema.sessionRegistrations.id, id)).limit(1);
    return registration;
  }

  async getSessionRegistrationByAttendee(sessionId: string, attendeeId: string): Promise<SessionRegistration | undefined> {
    const [registration] = await db.select().from(schema.sessionRegistrations)
      .where(and(eq(schema.sessionRegistrations.sessionId, sessionId), eq(schema.sessionRegistrations.attendeeId, attendeeId)))
      .limit(1);
    return registration;
  }

  async getSessionRegistrationsByAttendee(attendeeId: string): Promise<SessionRegistration[]> {
    return db.select().from(schema.sessionRegistrations).where(eq(schema.sessionRegistrations.attendeeId, attendeeId));
  }

  async createSessionRegistration(registration: InsertSessionRegistration): Promise<SessionRegistration> {
    const id = generateId("sreg");
    const [created] = await db.insert(schema.sessionRegistrations).values({ ...registration, id } as any).returning();
    return created;
  }

  async updateSessionRegistration(id: string, registration: Partial<InsertSessionRegistration>): Promise<SessionRegistration | undefined> {
    const [updated] = await db.update(schema.sessionRegistrations).set(registration as any).where(eq(schema.sessionRegistrations.id, id)).returning();
    return updated;
  }

  async deleteSessionRegistration(id: string): Promise<boolean> {
    const result = await db.delete(schema.sessionRegistrations).where(eq(schema.sessionRegistrations.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSessionRegistrationCount(sessionId: string, status: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.sessionRegistrations)
      .where(and(eq(schema.sessionRegistrations.sessionId, sessionId), eq(schema.sessionRegistrations.status, status)));
    return result[0]?.count || 0;
  }

  async getNextWaitlistPosition(sessionId: string): Promise<number> {
    const result = await db.select({ maxPos: sql<number>`coalesce(max(${schema.sessionRegistrations.waitlistPosition}), 0)::int` })
      .from(schema.sessionRegistrations)
      .where(eq(schema.sessionRegistrations.sessionId, sessionId));
    return (result[0]?.maxPos || 0) + 1;
  }

  async promoteFromWaitlist(sessionId: string): Promise<SessionRegistration | undefined> {
    const [next] = await db.select().from(schema.sessionRegistrations)
      .where(and(eq(schema.sessionRegistrations.sessionId, sessionId), eq(schema.sessionRegistrations.status, "waitlisted")))
      .orderBy(asc(schema.sessionRegistrations.waitlistPosition))
      .limit(1);
    if (!next) return undefined;
    return this.updateSessionRegistration(next.id, { status: "registered", waitlistPosition: null });
  }

  async getSessionCheckins(sessionId: string): Promise<SessionCheckin[]> {
    return db.select().from(schema.sessionCheckins).where(eq(schema.sessionCheckins.sessionId, sessionId));
  }

  async getSessionCheckinsByAttendee(attendeeId: string): Promise<SessionCheckin[]> {
    return db.select().from(schema.sessionCheckins).where(eq(schema.sessionCheckins.attendeeId, attendeeId));
  }

  async getSessionCheckinsByEvent(eventId: string): Promise<SessionCheckin[]> {
    const eventSessions = await this.getSessions(eventId);
    if (eventSessions.length === 0) return [];
    const sessionIds = eventSessions.map(s => s.id);
    return db.select().from(schema.sessionCheckins)
      .where(inArray(schema.sessionCheckins.sessionId, sessionIds));
  }

  async getLatestSessionCheckin(sessionId: string, attendeeId: string): Promise<SessionCheckin | undefined> {
    const [checkin] = await db.select().from(schema.sessionCheckins)
      .where(and(eq(schema.sessionCheckins.sessionId, sessionId), eq(schema.sessionCheckins.attendeeId, attendeeId)))
      .orderBy(desc(schema.sessionCheckins.timestamp))
      .limit(1);
    return checkin;
  }

  async createSessionCheckin(checkin: InsertSessionCheckin): Promise<SessionCheckin> {
    const id = generateId("schk");
    const [created] = await db.insert(schema.sessionCheckins).values({ ...checkin, id } as any).returning();
    return created;
  }

  async isAttendeeCheckedIntoSession(sessionId: string, attendeeId: string): Promise<boolean> {
    const latest = await this.getLatestSessionCheckin(sessionId, attendeeId);
    return latest?.action === "checkin";
  }

  async getCustomFonts(customerId: string): Promise<CustomFont[]> {
    return db.select().from(schema.customFonts).where(eq(schema.customFonts.customerId, customerId));
  }

  async getCustomFont(id: string): Promise<CustomFont | undefined> {
    const [font] = await db.select().from(schema.customFonts).where(eq(schema.customFonts.id, id)).limit(1);
    return font;
  }

  async createCustomFont(font: InsertCustomFont): Promise<CustomFont> {
    const id = generateId("font");
    const [created] = await db.insert(schema.customFonts).values({ ...font, id } as any).returning();
    return created;
  }

  async updateCustomFont(id: string, font: Partial<InsertCustomFont>): Promise<CustomFont | undefined> {
    const [updated] = await db.update(schema.customFonts).set(font as any).where(eq(schema.customFonts.id, id)).returning();
    return updated;
  }

  async deleteCustomFont(id: string): Promise<boolean> {
    const result = await db.delete(schema.customFonts).where(eq(schema.customFonts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getStaffSessions(eventId: string): Promise<StaffSession[]> {
    return db.select().from(schema.staffSessions).where(eq(schema.staffSessions.eventId, eventId));
  }

  async getStaffSession(id: string): Promise<StaffSession | undefined> {
    const [session] = await db.select().from(schema.staffSessions).where(eq(schema.staffSessions.id, id)).limit(1);
    return session;
  }

  async getStaffSessionByToken(token: string): Promise<StaffSession | undefined> {
    const [session] = await db.select().from(schema.staffSessions).where(eq(schema.staffSessions.token, token)).limit(1);
    return session;
  }

  async createStaffSession(session: InsertStaffSession): Promise<StaffSession> {
    const id = generateId("tss");
    const [created] = await db.insert(schema.staffSessions).values({ ...session, id } as any).returning();
    return created;
  }

  async updateStaffSession(id: string, updates: Partial<InsertStaffSession>): Promise<StaffSession | undefined> {
    const [updated] = await db.update(schema.staffSessions).set(updates as any).where(eq(schema.staffSessions.id, id)).returning();
    return updated;
  }

  async deleteStaffSession(id: string): Promise<boolean> {
    const result = await db.delete(schema.staffSessions).where(eq(schema.staffSessions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async invalidateStaffSession(id: string): Promise<boolean> {
    const result = await db.update(schema.staffSessions).set({ isActive: false }).where(eq(schema.staffSessions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async cleanupExpiredStaffSessions(): Promise<number> {
    const result = await db.delete(schema.staffSessions).where(lt(schema.staffSessions.expiresAt, new Date()));
    return result.rowCount ?? 0;
  }

  async getStaffActivityLogs(eventId: string): Promise<StaffActivityLog[]> {
    return db.select().from(schema.staffActivityLog).where(eq(schema.staffActivityLog.eventId, eventId));
  }

  async getStaffActivityLogsBySession(sessionId: string): Promise<StaffActivityLog[]> {
    return db.select().from(schema.staffActivityLog).where(eq(schema.staffActivityLog.sessionId, sessionId));
  }

  async createStaffActivityLog(log: InsertStaffActivityLog): Promise<StaffActivityLog> {
    const id = generateId("tsal");
    const [created] = await db.insert(schema.staffActivityLog).values({ ...log, id } as any).returning();
    return created;
  }

  async getEventBadgeTemplateOverrides(eventId: string): Promise<EventBadgeTemplateOverride[]> {
    return db.select().from(schema.eventBadgeTemplateOverrides).where(eq(schema.eventBadgeTemplateOverrides.eventId, eventId));
  }

  async getEventBadgeTemplateOverride(id: string): Promise<EventBadgeTemplateOverride | undefined> {
    const [override] = await db.select().from(schema.eventBadgeTemplateOverrides).where(eq(schema.eventBadgeTemplateOverrides.id, id)).limit(1);
    return override;
  }

  async getEventBadgeTemplateOverrideByType(eventId: string, participantType: string): Promise<EventBadgeTemplateOverride | undefined> {
    const [override] = await db.select().from(schema.eventBadgeTemplateOverrides)
      .where(and(eq(schema.eventBadgeTemplateOverrides.eventId, eventId), eq(schema.eventBadgeTemplateOverrides.participantType, participantType)))
      .limit(1);
    return override;
  }

  async createEventBadgeTemplateOverride(override: InsertEventBadgeTemplateOverride): Promise<EventBadgeTemplateOverride> {
    const id = generateId("override");
    const [created] = await db.insert(schema.eventBadgeTemplateOverrides).values({ ...override, id }).returning();
    return created;
  }

  async updateEventBadgeTemplateOverride(id: string, override: Partial<InsertEventBadgeTemplateOverride>): Promise<EventBadgeTemplateOverride | undefined> {
    const [updated] = await db.update(schema.eventBadgeTemplateOverrides).set(override).where(eq(schema.eventBadgeTemplateOverrides.id, id)).returning();
    return updated;
  }

  async deleteEventBadgeTemplateOverride(id: string): Promise<boolean> {
    const result = await db.delete(schema.eventBadgeTemplateOverrides).where(eq(schema.eventBadgeTemplateOverrides.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSyncJobs(integrationId: string): Promise<SyncJob[]> {
    return db.select().from(schema.syncJobs).where(eq(schema.syncJobs.integrationId, integrationId));
  }

  async getSyncJob(id: string): Promise<SyncJob | undefined> {
    const [job] = await db.select().from(schema.syncJobs).where(eq(schema.syncJobs.id, id)).limit(1);
    return job;
  }

  async getPendingSyncJobs(): Promise<SyncJob[]> {
    return db.select().from(schema.syncJobs).where(eq(schema.syncJobs.status, "pending"));
  }

  async getPendingSyncJobsByConfig(configId: string): Promise<SyncJob[]> {
    return db.select().from(schema.syncJobs).where(
      and(
        eq(schema.syncJobs.status, "pending"),
        eq(schema.syncJobs.endpointConfigId, configId)
      )
    );
  }

  async getStaleRunningSyncJobs(): Promise<SyncJob[]> {
    return db.select().from(schema.syncJobs)
      .where(eq(schema.syncJobs.status, "running"));
  }

  async getDueSyncJobs(): Promise<SyncJob[]> {
    return db.select().from(schema.syncJobs)
      .where(and(
        eq(schema.syncJobs.status, "pending"),
        or(
          isNull(schema.syncJobs.nextRetryAt),
          lte(schema.syncJobs.nextRetryAt, new Date())
        )
      ))
      .orderBy(schema.syncJobs.priority, schema.syncJobs.createdAt);
  }

  async createSyncJob(job: InsertSyncJob): Promise<SyncJob> {
    const id = generateId("sync");
    const [created] = await db.insert(schema.syncJobs).values({ ...job, id }).returning();
    return created;
  }

  async updateSyncJob(id: string, job: Partial<InsertSyncJob>): Promise<SyncJob | undefined> {
    const [updated] = await db.update(schema.syncJobs).set(job).where(eq(schema.syncJobs.id, id)).returning();
    return updated;
  }

  async deleteSyncJob(id: string): Promise<boolean> {
    const result = await db.delete(schema.syncJobs).where(eq(schema.syncJobs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getEndpointConfigsDueForSync(): Promise<IntegrationEndpointConfig[]> {
    return db.select().from(schema.integrationEndpointConfigs)
      .where(and(
        eq(schema.integrationEndpointConfigs.syncEnabled, true),
        or(
          isNull(schema.integrationEndpointConfigs.lastSyncAt),
          sql`"last_sync_at" < now() - ("sync_interval_seconds" * interval '1 second')`
        )
      ));
  }

  async updateEndpointConfigSyncStatus(id: string, status: string, error?: string, count?: number): Promise<void> {
    await db.update(schema.integrationEndpointConfigs).set({
      syncStatus: status,
      lastSyncError: error || null,
      lastSyncAt: new Date(),
      lastSyncCount: count,
    }).where(eq(schema.integrationEndpointConfigs.id, id));
  }

  async getEventWorkflowConfig(eventId: string): Promise<EventWorkflowConfig | undefined> {
    const [config] = await db.select().from(schema.eventWorkflowConfigs).where(eq(schema.eventWorkflowConfigs.eventId, eventId)).limit(1);
    return config;
  }

  async getEventWorkflowWithSteps(eventId: string): Promise<EventWorkflowWithSteps | undefined> {
    const config = await this.getEventWorkflowConfig(eventId);
    if (!config) return undefined;

    const steps = await this.getEventWorkflowSteps(eventId);
    const stepsWithData: WorkflowStepWithData[] = await Promise.all(
      steps.map(async (step) => {
        const questions = step.stepType === "buyer_questions" ? await this.getEventBuyerQuestions(step.id) : undefined;
        const disclaimer = step.stepType === "disclaimer" ? await this.getEventDisclaimer(step.id) : undefined;
        return { ...step, questions, disclaimer };
      })
    );

    return { ...config, steps: stepsWithData };
  }

  async createEventWorkflowConfig(config: InsertEventWorkflowConfig): Promise<EventWorkflowConfig> {
    const id = generateId("wfc");
    const [created] = await db.insert(schema.eventWorkflowConfigs).values({ ...config, id }).returning();
    return created;
  }

  async updateEventWorkflowConfig(eventId: string, config: Partial<InsertEventWorkflowConfig>): Promise<EventWorkflowConfig | undefined> {
    const existing = await this.getEventWorkflowConfig(eventId);
    if (!existing) return undefined;
    const [updated] = await db.update(schema.eventWorkflowConfigs).set(config).where(eq(schema.eventWorkflowConfigs.id, existing.id)).returning();
    return updated;
  }

  async deleteEventWorkflowConfig(eventId: string): Promise<boolean> {
    const result = await db.delete(schema.eventWorkflowConfigs).where(eq(schema.eventWorkflowConfigs.eventId, eventId));
    return (result.rowCount ?? 0) > 0;
  }

  async getEventWorkflowSteps(eventId: string): Promise<EventWorkflowStep[]> {
    return db.select().from(schema.eventWorkflowSteps)
      .where(eq(schema.eventWorkflowSteps.eventId, eventId))
      .orderBy(asc(schema.eventWorkflowSteps.position));
  }

  async getEventWorkflowStep(id: string): Promise<EventWorkflowStep | undefined> {
    const [step] = await db.select().from(schema.eventWorkflowSteps).where(eq(schema.eventWorkflowSteps.id, id)).limit(1);
    return step;
  }

  async createEventWorkflowStep(step: InsertEventWorkflowStep): Promise<EventWorkflowStep> {
    const id = generateId("wfs");
    const [created] = await db.insert(schema.eventWorkflowSteps).values({ ...step, id }).returning();
    return created;
  }

  async updateEventWorkflowStep(id: string, step: Partial<InsertEventWorkflowStep>): Promise<EventWorkflowStep | undefined> {
    const [updated] = await db.update(schema.eventWorkflowSteps).set(step).where(eq(schema.eventWorkflowSteps.id, id)).returning();
    return updated;
  }

  async deleteEventWorkflowStep(id: string): Promise<boolean> {
    const result = await db.delete(schema.eventWorkflowSteps).where(eq(schema.eventWorkflowSteps.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async reorderEventWorkflowSteps(eventId: string, stepIds: string[]): Promise<EventWorkflowStep[]> {
    const updates = stepIds.map((id, idx) => 
      db.update(schema.eventWorkflowSteps).set({ position: idx }).where(eq(schema.eventWorkflowSteps.id, id))
    );
    await Promise.all(updates);
    return this.getEventWorkflowSteps(eventId);
  }

  async getEventBuyerQuestions(stepId: string): Promise<EventBuyerQuestion[]> {
    return db.select().from(schema.eventBuyerQuestions)
      .where(eq(schema.eventBuyerQuestions.stepId, stepId))
      .orderBy(asc(schema.eventBuyerQuestions.position));
  }

  async getEventBuyerQuestionsByEvent(eventId: string): Promise<EventBuyerQuestion[]> {
    return db.select().from(schema.eventBuyerQuestions)
      .where(eq(schema.eventBuyerQuestions.eventId, eventId))
      .orderBy(asc(schema.eventBuyerQuestions.position));
  }

  async getEventBuyerQuestion(id: string): Promise<EventBuyerQuestion | undefined> {
    const [question] = await db.select().from(schema.eventBuyerQuestions).where(eq(schema.eventBuyerQuestions.id, id)).limit(1);
    return question;
  }

  async createEventBuyerQuestion(question: InsertEventBuyerQuestion): Promise<EventBuyerQuestion> {
    const id = generateId("q");
    const [created] = await db.insert(schema.eventBuyerQuestions).values({ ...question, id }).returning();
    return created;
  }

  async updateEventBuyerQuestion(id: string, question: Partial<InsertEventBuyerQuestion>): Promise<EventBuyerQuestion | undefined> {
    const [updated] = await db.update(schema.eventBuyerQuestions).set(question).where(eq(schema.eventBuyerQuestions.id, id)).returning();
    return updated;
  }

  async deleteEventBuyerQuestion(id: string): Promise<boolean> {
    const result = await db.delete(schema.eventBuyerQuestions).where(eq(schema.eventBuyerQuestions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getEventDisclaimer(stepId: string): Promise<EventDisclaimer | undefined> {
    const [disclaimer] = await db.select().from(schema.eventDisclaimers).where(eq(schema.eventDisclaimers.stepId, stepId)).limit(1);
    return disclaimer;
  }

  async getEventDisclaimersByEvent(eventId: string): Promise<EventDisclaimer[]> {
    return db.select().from(schema.eventDisclaimers).where(eq(schema.eventDisclaimers.eventId, eventId));
  }

  async createEventDisclaimer(disclaimer: InsertEventDisclaimer): Promise<EventDisclaimer> {
    const id = generateId("disc");
    const [created] = await db.insert(schema.eventDisclaimers).values({ ...disclaimer, id }).returning();
    return created;
  }

  async updateEventDisclaimer(id: string, disclaimer: Partial<InsertEventDisclaimer>): Promise<EventDisclaimer | undefined> {
    const [updated] = await db.update(schema.eventDisclaimers).set(disclaimer).where(eq(schema.eventDisclaimers.id, id)).returning();
    return updated;
  }

  async deleteEventDisclaimer(id: string): Promise<boolean> {
    const result = await db.delete(schema.eventDisclaimers).where(eq(schema.eventDisclaimers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getAttendeeWorkflowResponses(attendeeId: string, eventId: string): Promise<AttendeeWorkflowResponse[]> {
    return db.select().from(schema.attendeeWorkflowResponses)
      .where(and(eq(schema.attendeeWorkflowResponses.attendeeId, attendeeId), eq(schema.attendeeWorkflowResponses.eventId, eventId)));
  }

  async getAttendeeWorkflowResponsesByEvent(eventId: string): Promise<AttendeeWorkflowResponse[]> {
    return db.select().from(schema.attendeeWorkflowResponses)
      .where(eq(schema.attendeeWorkflowResponses.eventId, eventId));
  }

  async createAttendeeWorkflowResponse(response: InsertAttendeeWorkflowResponse): Promise<AttendeeWorkflowResponse> {
    const id = generateId("resp");
    const [created] = await db.insert(schema.attendeeWorkflowResponses).values({ ...response, id }).returning();
    return created;
  }

  async deleteAttendeeWorkflowResponses(attendeeId: string, eventId: string): Promise<boolean> {
    const result = await db.delete(schema.attendeeWorkflowResponses)
      .where(and(eq(schema.attendeeWorkflowResponses.attendeeId, attendeeId), eq(schema.attendeeWorkflowResponses.eventId, eventId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getAttendeeSignature(attendeeId: string, disclaimerId: string): Promise<AttendeeSignature | undefined> {
    const [signature] = await db.select().from(schema.attendeeSignatures)
      .where(and(eq(schema.attendeeSignatures.attendeeId, attendeeId), eq(schema.attendeeSignatures.disclaimerId, disclaimerId)))
      .limit(1);
    return signature;
  }

  async getAttendeeSignatures(attendeeId: string): Promise<AttendeeSignature[]> {
    return db.select().from(schema.attendeeSignatures).where(eq(schema.attendeeSignatures.attendeeId, attendeeId));
  }

  async getAttendeeSignaturesByEvent(eventId: string): Promise<AttendeeSignature[]> {
    return db.select().from(schema.attendeeSignatures).where(eq(schema.attendeeSignatures.eventId, eventId));
  }

  async createAttendeeSignature(signature: InsertAttendeeSignature): Promise<AttendeeSignature> {
    const id = generateId("sig");
    const [created] = await db.insert(schema.attendeeSignatures).values({ ...signature, id }).returning();
    return created;
  }

  async updateAttendeeSignature(id: string, data: Partial<Pick<AttendeeSignature, 'signatureData' | 'ipAddress' | 'userAgent'>>): Promise<AttendeeSignature | undefined> {
    const [updated] = await db.update(schema.attendeeSignatures)
      .set({ ...data, signedAt: new Date() })
      .where(eq(schema.attendeeSignatures.id, id))
      .returning();
    return updated;
  }

  async deleteAttendeeSignature(id: string): Promise<boolean> {
    const result = await db.delete(schema.attendeeSignatures).where(eq(schema.attendeeSignatures.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteAttendeeSignaturesByAttendee(attendeeId: string, eventId: string): Promise<boolean> {
    const result = await db.delete(schema.attendeeSignatures)
      .where(and(eq(schema.attendeeSignatures.attendeeId, attendeeId), eq(schema.attendeeSignatures.eventId, eventId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Event Sync States
  async getEventSyncStates(eventId: string): Promise<EventSyncState[]> {
    return db.select().from(schema.eventSyncStates).where(eq(schema.eventSyncStates.eventId, eventId));
  }

  async getEventSyncState(eventId: string, dataType: string): Promise<EventSyncState | undefined> {
    const [state] = await db.select().from(schema.eventSyncStates)
      .where(and(
        eq(schema.eventSyncStates.eventId, eventId),
        eq(schema.eventSyncStates.dataType, dataType)
      ))
      .limit(1);
    return state;
  }

  async getEventSyncStateById(id: string): Promise<EventSyncState | undefined> {
    const [state] = await db.select().from(schema.eventSyncStates)
      .where(eq(schema.eventSyncStates.id, id))
      .limit(1);
    return state;
  }

  async createEventSyncState(state: InsertEventSyncState): Promise<EventSyncState> {
    const id = generateId("ess");
    const [created] = await db.insert(schema.eventSyncStates).values({ ...state, id } as any).returning();
    return created;
  }

  async updateEventSyncState(id: string, state: Partial<InsertEventSyncState>): Promise<EventSyncState | undefined> {
    const [updated] = await db.update(schema.eventSyncStates)
      .set({ ...state, updatedAt: new Date() } as any)
      .where(eq(schema.eventSyncStates.id, id))
      .returning();
    return updated;
  }

  async upsertEventSyncState(
    eventId: string, 
    dataType: string, 
    state: Partial<InsertEventSyncState>
  ): Promise<EventSyncState> {
    const existing = await this.getEventSyncState(eventId, dataType);
    if (existing) {
      return (await this.updateEventSyncState(existing.id, state))!;
    }
    return this.createEventSyncState({ 
      eventId, 
      dataType, 
      integrationId: state.integrationId!, 
      ...state 
    } as InsertEventSyncState);
  }

  async deleteEventSyncState(id: string): Promise<boolean> {
    const result = await db.delete(schema.eventSyncStates).where(eq(schema.eventSyncStates.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSyncStatesDueForSync(): Promise<EventSyncState[]> {
    const now = new Date();
    return db.select().from(schema.eventSyncStates)
      .where(and(
        eq(schema.eventSyncStates.syncEnabled, true),
        or(
          isNull(schema.eventSyncStates.nextSyncAt),
          lt(schema.eventSyncStates.nextSyncAt, now)
        )
      ));
  }

  // System Settings methods
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db.select().from(schema.systemSettings)
      .where(eq(schema.systemSettings.key, key))
      .limit(1);
    return setting;
  }

  async getAllSystemSettings(): Promise<SystemSetting[]> {
    return db.select().from(schema.systemSettings);
  }

  async upsertSystemSetting(
    key: string, 
    value: string | null, 
    jsonValue?: object | null, 
    description?: string, 
    updatedBy?: string
  ): Promise<SystemSetting> {
    const existing = await this.getSystemSetting(key);
    if (existing) {
      const [updated] = await db.update(schema.systemSettings)
        .set({ 
          value, 
          jsonValue: jsonValue ?? null, 
          description: description ?? existing.description,
          updatedBy: updatedBy ?? existing.updatedBy,
          updatedAt: new Date() 
        })
        .where(eq(schema.systemSettings.id, existing.id))
        .returning();
      return updated;
    }
    
    const id = generateId("setting");
    const [setting] = await db.insert(schema.systemSettings)
      .values({ id, key, value, jsonValue: jsonValue ?? null, description: description ?? null, updatedBy: updatedBy ?? null })
      .returning();
    return setting;
  }

  async deleteSystemSetting(key: string): Promise<boolean> {
    const result = await db.delete(schema.systemSettings)
      .where(eq(schema.systemSettings.key, key));
    return (result.rowCount ?? 0) > 0;
  }

  // Event Notification Rules
  async getEventNotificationRules(eventId: string): Promise<EventNotificationRule[]> {
    return db.select().from(schema.eventNotificationRules)
      .where(eq(schema.eventNotificationRules.eventId, eventId))
      .orderBy(desc(schema.eventNotificationRules.createdAt));
  }

  async getEventNotificationRule(id: string): Promise<EventNotificationRule | undefined> {
    const [rule] = await db.select().from(schema.eventNotificationRules)
      .where(eq(schema.eventNotificationRules.id, id))
      .limit(1);
    return rule;
  }

  async getActiveNotificationRulesForAttendee(
    eventId: string,
    attendee: { participantType: string; company?: string | null; firstName: string; lastName: string }
  ): Promise<EventNotificationRule[]> {
    const rules = await db.select().from(schema.eventNotificationRules)
      .where(and(
        eq(schema.eventNotificationRules.eventId, eventId),
        eq(schema.eventNotificationRules.isActive, true)
      ));
    
    return rules.filter(rule => {
      const participantTypes = (rule.participantTypes as string[]) || [];
      const companyNames = (rule.companyNames as string[]) || [];
      const attendeeNames = (rule.attendeeNames as string[]) || [];
      
      if (participantTypes.length === 0 && companyNames.length === 0 && attendeeNames.length === 0) {
        return true;
      }
      
      if (participantTypes.length > 0 && !participantTypes.includes(attendee.participantType)) {
        return false;
      }
      
      if (companyNames.length > 0) {
        if (!attendee.company) return false;
        const lowerCompany = attendee.company.toLowerCase();
        if (!companyNames.some(c => lowerCompany.includes(c.toLowerCase()))) {
          return false;
        }
      }
      
      if (attendeeNames.length > 0) {
        const fullName = `${attendee.firstName} ${attendee.lastName}`.toLowerCase();
        if (!attendeeNames.some(n => fullName.includes(n.toLowerCase()))) {
          return false;
        }
      }
      
      return true;
    });
  }

  async createEventNotificationRule(rule: InsertEventNotificationRule): Promise<EventNotificationRule> {
    const id = generateId("notif");
    const now = new Date();
    const [created] = await db.insert(schema.eventNotificationRules)
      .values({
        id,
        ...rule,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return created;
  }

  async updateEventNotificationRule(id: string, rule: Partial<InsertEventNotificationRule>): Promise<EventNotificationRule | undefined> {
    const [updated] = await db.update(schema.eventNotificationRules)
      .set({
        ...rule,
        updatedAt: new Date(),
      })
      .where(eq(schema.eventNotificationRules.id, id))
      .returning();
    return updated;
  }

  async deleteEventNotificationRule(id: string): Promise<boolean> {
    const result = await db.delete(schema.eventNotificationRules)
      .where(eq(schema.eventNotificationRules.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // User Activity Tracking
  async recordUserActivity(activity: InsertUserActivity): Promise<UserActivity> {
    const id = generateId("act");
    const [created] = await db.insert(schema.userActivity)
      .values({
        id,
        ...activity,
        createdAt: new Date(),
      })
      .returning();
    return created;
  }

  async getRecentUserActivity(options: { 
    limit?: number; 
    userId?: string;
    customerId?: string;
    since?: Date;
  }): Promise<(UserActivity & { user?: User })[]> {
    const { limit = 50, userId, customerId, since } = options;
    
    const conditions = [];
    if (userId) conditions.push(eq(schema.userActivity.userId, userId));
    if (customerId) conditions.push(eq(schema.userActivity.customerId, customerId));
    if (since) conditions.push(sql`${schema.userActivity.createdAt} >= ${since}`);
    
    const activities = await db.select()
      .from(schema.userActivity)
      .leftJoin(schema.users, eq(schema.userActivity.userId, schema.users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.userActivity.createdAt))
      .limit(limit);
    
    return activities.map(row => ({
      ...row.user_activity,
      user: row.users || undefined,
    }));
  }

  // User Presence (online status)
  async updateUserPresence(userId: string, data: {
    customerId?: string | null;
    currentPage?: string;
    currentPageTitle?: string;
    sessionId?: string;
    userAgent?: string;
  }): Promise<UserPresence> {
    const id = generateId("pres");
    const now = new Date();
    
    // Upsert - update if exists, insert if not
    const [result] = await db.insert(schema.userPresence)
      .values({
        id,
        userId,
        customerId: data.customerId,
        currentPage: data.currentPage,
        currentPageTitle: data.currentPageTitle,
        lastActivityAt: now,
        isOnline: true,
        sessionId: data.sessionId,
        userAgent: data.userAgent,
      })
      .onConflictDoUpdate({
        target: schema.userPresence.userId,
        set: {
          currentPage: data.currentPage,
          currentPageTitle: data.currentPageTitle,
          lastActivityAt: now,
          isOnline: true,
          sessionId: data.sessionId,
          userAgent: data.userAgent,
        },
      })
      .returning();
    
    return result;
  }

  async markUserOffline(userId: string): Promise<void> {
    await db.update(schema.userPresence)
      .set({ isOnline: false, lastActivityAt: new Date() })
      .where(eq(schema.userPresence.userId, userId));
  }

  async getOnlineUsers(options?: { 
    customerId?: string;
    inactiveThresholdMinutes?: number;
  }): Promise<(UserPresence & { user: User })[]> {
    const { customerId, inactiveThresholdMinutes = 5 } = options || {};
    const thresholdTime = new Date(Date.now() - inactiveThresholdMinutes * 60 * 1000);
    
    const conditions = [
      eq(schema.userPresence.isOnline, true),
      sql`${schema.userPresence.lastActivityAt} >= ${thresholdTime}`,
    ];
    
    if (customerId) {
      conditions.push(eq(schema.userPresence.customerId, customerId));
    }
    
    const results = await db.select()
      .from(schema.userPresence)
      .innerJoin(schema.users, eq(schema.userPresence.userId, schema.users.id))
      .where(and(...conditions))
      .orderBy(desc(schema.userPresence.lastActivityAt));
    
    return results.map(row => ({
      ...row.user_presence,
      user: row.users,
    }));
  }

  async getActivityStats(options?: { customerId?: string; since?: Date }): Promise<{
    totalPageViews: number;
    uniqueUsers: number;
    topPages: { page: string; pageTitle: string | null; count: number }[];
    activeUsersByHour: { hour: number; count: number }[];
  }> {
    const { customerId, since = new Date(Date.now() - 24 * 60 * 60 * 1000) } = options || {};
    
    const conditions = [sql`${schema.userActivity.createdAt} >= ${since}`];
    if (customerId) conditions.push(eq(schema.userActivity.customerId, customerId));
    
    // Total page views
    const [viewsResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.userActivity)
      .where(and(...conditions));
    
    // Unique users
    const [usersResult] = await db.select({ count: sql<number>`count(distinct ${schema.userActivity.userId})::int` })
      .from(schema.userActivity)
      .where(and(...conditions));
    
    // Top pages
    const topPages = await db.select({
      page: schema.userActivity.page,
      pageTitle: schema.userActivity.pageTitle,
      count: sql<number>`count(*)::int`,
    })
      .from(schema.userActivity)
      .where(and(...conditions))
      .groupBy(schema.userActivity.page, schema.userActivity.pageTitle)
      .orderBy(sql`count(*) desc`)
      .limit(10);
    
    // Activity by hour (last 24h)
    const hourlyActivity = await db.select({
      hour: sql<number>`extract(hour from ${schema.userActivity.createdAt})::int`,
      count: sql<number>`count(*)::int`,
    })
      .from(schema.userActivity)
      .where(and(...conditions))
      .groupBy(sql`extract(hour from ${schema.userActivity.createdAt})`)
      .orderBy(sql`extract(hour from ${schema.userActivity.createdAt})`);
    
    return {
      totalPageViews: viewsResult?.count ?? 0,
      uniqueUsers: usersResult?.count ?? 0,
      topPages,
      activeUsersByHour: hourlyActivity,
    };
  }

  // Application Error Logging
  async logError(error: InsertApplicationError): Promise<ApplicationError> {
    const id = generateId("err");
    const [created] = await db.insert(schema.applicationErrors)
      .values({ ...error, id })
      .returning();
    return created;
  }

  async getErrors(options?: {
    errorType?: string;
    isResolved?: boolean;
    customerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApplicationError[]> {
    const { errorType, isResolved, customerId, limit = 100, offset = 0 } = options || {};
    
    const conditions = [];
    if (errorType) conditions.push(eq(schema.applicationErrors.errorType, errorType));
    if (isResolved !== undefined) conditions.push(eq(schema.applicationErrors.isResolved, isResolved));
    if (customerId) conditions.push(eq(schema.applicationErrors.customerId, customerId));
    
    return db.select()
      .from(schema.applicationErrors)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.applicationErrors.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getError(id: string): Promise<ApplicationError | undefined> {
    const [error] = await db.select()
      .from(schema.applicationErrors)
      .where(eq(schema.applicationErrors.id, id))
      .limit(1);
    return error;
  }

  async resolveError(id: string, resolvedBy: string, notes?: string): Promise<ApplicationError | undefined> {
    const [updated] = await db.update(schema.applicationErrors)
      .set({
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy,
        notes,
      })
      .where(eq(schema.applicationErrors.id, id))
      .returning();
    return updated;
  }

  async getErrorStats(): Promise<{
    total: number;
    unresolved: number;
    byType: { type: string; count: number }[];
    last24h: number;
    last7d: number;
  }> {
    const [totalResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.applicationErrors);
    
    const [unresolvedResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.applicationErrors)
      .where(eq(schema.applicationErrors.isResolved, false));
    
    const byType = await db.select({
      type: schema.applicationErrors.errorType,
      count: sql<number>`count(*)::int`,
    })
      .from(schema.applicationErrors)
      .groupBy(schema.applicationErrors.errorType)
      .orderBy(sql`count(*) desc`);
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [last24hResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.applicationErrors)
      .where(sql`${schema.applicationErrors.createdAt} >= ${oneDayAgo}`);
    
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [last7dResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.applicationErrors)
      .where(sql`${schema.applicationErrors.createdAt} >= ${sevenDaysAgo}`);
    
    return {
      total: totalResult?.count ?? 0,
      unresolved: unresolvedResult?.count ?? 0,
      byType,
      last24h: last24hResult?.count ?? 0,
      last7d: last7dResult?.count ?? 0,
    };
  }

  async deleteOldErrors(olderThan: Date): Promise<number> {
    const result = await db.delete(schema.applicationErrors)
      .where(lt(schema.applicationErrors.createdAt, olderThan))
      .returning({ id: schema.applicationErrors.id });
    return result.length;
  }

  async createAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const id = generateId("audit");
    const [auditLog] = await db.insert(schema.adminAuditLog)
      .values({ id, ...log })
      .returning();
    return auditLog;
  }

  async getAuditLogs(options?: { userId?: string; customerId?: string; action?: string; resourceType?: string; limit?: number; offset?: number }): Promise<AdminAuditLog[]> {
    const conditions = [];
    if (options?.userId) conditions.push(eq(schema.adminAuditLog.userId, options.userId));
    if (options?.customerId) conditions.push(eq(schema.adminAuditLog.customerId, options.customerId));
    if (options?.action) conditions.push(eq(schema.adminAuditLog.action, options.action));
    if (options?.resourceType) conditions.push(eq(schema.adminAuditLog.resourceType, options.resourceType));

    const query = db.select().from(schema.adminAuditLog);
    const withWhere = conditions.length > 0 ? query.where(and(...conditions)) : query;
    return withWhere
      .orderBy(desc(schema.adminAuditLog.createdAt))
      .limit(options?.limit ?? 100)
      .offset(options?.offset ?? 0);
  }

  async getAuditLogStats(): Promise<{ total: number; last24h: number; last7d: number; byAction: { action: string; count: number }[]; byUser: { userId: string; userEmail: string; count: number }[] }> {
    const [totalResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.adminAuditLog);

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [last24hResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.adminAuditLog)
      .where(sql`${schema.adminAuditLog.createdAt} >= ${oneDayAgo}`);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [last7dResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.adminAuditLog)
      .where(sql`${schema.adminAuditLog.createdAt} >= ${sevenDaysAgo}`);

    const byAction = await db.select({
      action: schema.adminAuditLog.action,
      count: sql<number>`count(*)::int`,
    })
      .from(schema.adminAuditLog)
      .groupBy(schema.adminAuditLog.action)
      .orderBy(sql`count(*) desc`);

    const byUser = await db.select({
      userId: schema.adminAuditLog.userId,
      userEmail: schema.adminAuditLog.userEmail,
      count: sql<number>`count(*)::int`,
    })
      .from(schema.adminAuditLog)
      .groupBy(schema.adminAuditLog.userId, schema.adminAuditLog.userEmail)
      .orderBy(sql`count(*) desc`);

    return {
      total: totalResult?.count ?? 0,
      last24h: last24hResult?.count ?? 0,
      last7d: last7dResult?.count ?? 0,
      byAction,
      byUser,
    };
  }

  async getFeatureFlags(): Promise<FeatureFlag[]> {
    return db.select().from(schema.featureFlags).orderBy(asc(schema.featureFlags.category), asc(schema.featureFlags.name));
  }

  async getFeatureFlag(id: string): Promise<FeatureFlag | undefined> {
    const [flag] = await db.select().from(schema.featureFlags).where(eq(schema.featureFlags.id, id)).limit(1);
    return flag;
  }

  async getFeatureFlagByKey(key: string): Promise<FeatureFlag | undefined> {
    const [flag] = await db.select().from(schema.featureFlags).where(eq(schema.featureFlags.key, key)).limit(1);
    return flag;
  }

  async createFeatureFlag(flag: InsertFeatureFlag): Promise<FeatureFlag> {
    const [created] = await db.insert(schema.featureFlags).values(flag).returning();
    return created;
  }

  async updateFeatureFlag(id: string, flag: Partial<InsertFeatureFlag>): Promise<FeatureFlag | undefined> {
    const [updated] = await db.update(schema.featureFlags)
      .set({ ...flag, updatedAt: new Date() })
      .where(eq(schema.featureFlags.id, id))
      .returning();
    return updated;
  }

  async deleteFeatureFlag(id: string): Promise<boolean> {
    const result = await db.delete(schema.featureFlags).where(eq(schema.featureFlags.id, id)).returning();
    return result.length > 0;
  }

  async getCustomerRetentionPolicy(customerId: string): Promise<DataRetentionPolicy | null> {
    const [customer] = await db.select({ policy: schema.customers.dataRetentionPolicy })
      .from(schema.customers)
      .where(eq(schema.customers.id, customerId))
      .limit(1);
    return customer?.policy ?? null;
  }

  async updateCustomerRetentionPolicy(customerId: string, policy: DataRetentionPolicy): Promise<Customer | undefined> {
    const [updated] = await db.update(schema.customers)
      .set({ dataRetentionPolicy: policy })
      .where(eq(schema.customers.id, customerId))
      .returning();
    return updated;
  }

  async getEventRetentionOverride(eventId: string): Promise<Partial<DataRetentionPolicy> | null> {
    const [event] = await db.select({ override: schema.events.dataRetentionOverride })
      .from(schema.events)
      .where(eq(schema.events.id, eventId))
      .limit(1);
    return event?.override ?? null;
  }

  async updateEventRetentionOverride(eventId: string, override: Partial<DataRetentionPolicy> | null): Promise<Event | undefined> {
    const [updated] = await db.update(schema.events)
      .set({ dataRetentionOverride: override })
      .where(eq(schema.events.id, eventId))
      .returning();
    return updated;
  }

  async getEventsEligibleForRetention(): Promise<Array<{
    event: Event;
    customer: Customer;
    policy: DataRetentionPolicy;
    policySource: 'account' | 'event_override';
    eligibleDate: Date;
    attendeeCount: number;
  }>> {
    const customers = await db.select()
      .from(schema.customers)
      .where(sql`${schema.customers.dataRetentionPolicy} IS NOT NULL`);

    const results: Array<{
      event: Event;
      customer: Customer;
      policy: DataRetentionPolicy;
      policySource: 'account' | 'event_override';
      eligibleDate: Date;
      attendeeCount: number;
    }> = [];

    for (const customer of customers) {
      const accountPolicy = customer.dataRetentionPolicy;
      if (!accountPolicy?.enabled) continue;

      const events = await db.select()
        .from(schema.events)
        .where(and(
          eq(schema.events.customerId, customer.id),
          isNull(schema.events.retentionProcessedAt),
        ));

      for (const event of events) {
        const eventOverride = event.dataRetentionOverride as Partial<DataRetentionPolicy> | null;
        const effectivePolicy: DataRetentionPolicy = {
          ...accountPolicy,
          ...(eventOverride || {}),
        } as DataRetentionPolicy;

        if (!effectivePolicy.enabled) continue;

        const basis = effectivePolicy.retentionBasis || 'event_end_date';
        let referenceDate: Date | null = null;

        if (basis === 'event_end_date') {
          referenceDate = event.endDate || event.eventDate;
        } else {
          const [lastCheckin] = await db.select({ maxDate: sql<Date>`MAX(${schema.attendees.checkedInAt})` })
            .from(schema.attendees)
            .where(eq(schema.attendees.eventId, event.id));
          referenceDate = lastCheckin?.maxDate || event.endDate || event.eventDate;
        }

        if (!referenceDate) continue;

        const eligibleDate = new Date(referenceDate.getTime() + effectivePolicy.retentionDays * 24 * 60 * 60 * 1000);
        const now = new Date();

        if (eligibleDate <= now) {
          const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
            .from(schema.attendees)
            .where(eq(schema.attendees.eventId, event.id));

          results.push({
            event,
            customer,
            policy: effectivePolicy,
            policySource: eventOverride ? 'event_override' : 'account',
            eligibleDate,
            attendeeCount: Number(countResult?.count || 0),
          });
        }
      }
    }

    return results;
  }

  async getEventsPendingRetentionNotification(): Promise<Array<{
    event: Event;
    customer: Customer;
    policy: DataRetentionPolicy;
    eligibleDate: Date;
    attendeeCount: number;
  }>> {
    const customers = await db.select()
      .from(schema.customers)
      .where(sql`${schema.customers.dataRetentionPolicy} IS NOT NULL`);

    const results: Array<{
      event: Event;
      customer: Customer;
      policy: DataRetentionPolicy;
      eligibleDate: Date;
      attendeeCount: number;
    }> = [];

    for (const customer of customers) {
      const accountPolicy = customer.dataRetentionPolicy;
      if (!accountPolicy?.enabled || !accountPolicy.notifyDaysBefore) continue;

      const events = await db.select()
        .from(schema.events)
        .where(and(
          eq(schema.events.customerId, customer.id),
          isNull(schema.events.retentionProcessedAt),
          isNull(schema.events.retentionNotifiedAt),
        ));

      for (const event of events) {
        const eventOverride = event.dataRetentionOverride as Partial<DataRetentionPolicy> | null;
        const effectivePolicy: DataRetentionPolicy = {
          ...accountPolicy,
          ...(eventOverride || {}),
        } as DataRetentionPolicy;

        if (!effectivePolicy.enabled) continue;

        const basis = effectivePolicy.retentionBasis || 'event_end_date';
        let referenceDate: Date | null = event.endDate || event.eventDate;

        if (basis === 'last_check_in') {
          const [lastCheckin] = await db.select({ maxDate: sql<Date>`MAX(${schema.attendees.checkedInAt})` })
            .from(schema.attendees)
            .where(eq(schema.attendees.eventId, event.id));
          referenceDate = lastCheckin?.maxDate || referenceDate;
        }

        if (!referenceDate) continue;

        const eligibleDate = new Date(referenceDate.getTime() + effectivePolicy.retentionDays * 24 * 60 * 60 * 1000);
        const notifyDate = new Date(eligibleDate.getTime() - effectivePolicy.notifyDaysBefore * 24 * 60 * 60 * 1000);
        const now = new Date();

        if (notifyDate <= now && eligibleDate > now) {
          const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
            .from(schema.attendees)
            .where(eq(schema.attendees.eventId, event.id));

          results.push({
            event,
            customer,
            policy: effectivePolicy,
            eligibleDate,
            attendeeCount: Number(countResult?.count || 0),
          });
        }
      }
    }

    return results;
  }

  async anonymizeEventAttendees(eventId: string): Promise<number> {
    return await db.transaction(async (tx) => {
      const result = await tx.update(schema.attendees)
        .set({
          firstName: '[Removed]',
          lastName: '[Removed]',
          email: sql`'redacted-' || ${schema.attendees.id} || '@removed.local'`,
          company: null,
          title: null,
          customFields: null,
          externalId: null,
          orderCode: null,
        } as any)
        .where(eq(schema.attendees.eventId, eventId));
      
      await tx.delete(schema.attendeeSignatures)
        .where(eq(schema.attendeeSignatures.eventId, eventId));
      
      await tx.delete(schema.attendeeWorkflowResponses)
        .where(eq(schema.attendeeWorkflowResponses.eventId, eventId));

      return result.rowCount ?? 0;
    });
  }

  async markEventRetentionProcessed(eventId: string): Promise<void> {
    await db.update(schema.events)
      .set({ retentionProcessedAt: new Date() })
      .where(eq(schema.events.id, eventId));
  }

  async markEventRetentionNotified(eventId: string): Promise<void> {
    await db.update(schema.events)
      .set({ retentionNotifiedAt: new Date() })
      .where(eq(schema.events.id, eventId));
  }

  async logRetentionAction(entry: InsertDataRetentionLog): Promise<DataRetentionLog> {
    const [log] = await db.insert(schema.dataRetentionLog)
      .values({ ...entry, id: generateId('drl') })
      .returning();
    return log;
  }

  async getRetentionLogs(customerId: string, limit = 50): Promise<DataRetentionLog[]> {
    return await db.select()
      .from(schema.dataRetentionLog)
      .where(eq(schema.dataRetentionLog.customerId, customerId))
      .orderBy(desc(schema.dataRetentionLog.processedAt))
      .limit(limit);
  }

  async getRetentionPreview(customerId: string): Promise<Array<{
    eventId: string;
    eventName: string;
    eventDate: Date;
    endDate: Date | null;
    attendeeCount: number;
    eligibleDate: Date;
    action: string;
    daysUntilAction: number;
  }>> {
    const policy = await this.getCustomerRetentionPolicy(customerId);
    if (!policy?.enabled) return [];

    const events = await db.select()
      .from(schema.events)
      .where(and(
        eq(schema.events.customerId, customerId),
        isNull(schema.events.retentionProcessedAt),
      ));

    const results: Array<{
      eventId: string;
      eventName: string;
      eventDate: Date;
      endDate: Date | null;
      attendeeCount: number;
      eligibleDate: Date;
      action: string;
      daysUntilAction: number;
    }> = [];

    for (const event of events) {
      const eventOverride = event.dataRetentionOverride as Partial<DataRetentionPolicy> | null;
      const effectivePolicy: DataRetentionPolicy = { ...policy, ...(eventOverride || {}) } as DataRetentionPolicy;
      if (!effectivePolicy.enabled) continue;

      const basis = effectivePolicy.retentionBasis || 'event_end_date';
      let referenceDate: Date | null = event.endDate || event.eventDate;

      if (basis === 'last_check_in') {
        const [lastCheckin] = await db.select({ maxDate: sql<Date>`MAX(${schema.attendees.checkedInAt})` })
          .from(schema.attendees)
          .where(eq(schema.attendees.eventId, event.id));
        referenceDate = lastCheckin?.maxDate || referenceDate;
      }

      if (!referenceDate) continue;

      const eligibleDate = new Date(referenceDate.getTime() + effectivePolicy.retentionDays * 24 * 60 * 60 * 1000);
      const now = new Date();
      const daysUntilAction = Math.ceil((eligibleDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(schema.attendees)
        .where(eq(schema.attendees.eventId, event.id));

      results.push({
        eventId: event.id,
        eventName: event.name,
        eventDate: event.eventDate,
        endDate: event.endDate,
        attendeeCount: Number(countResult?.count || 0),
        eligibleDate,
        action: effectivePolicy.action,
        daysUntilAction,
      });
    }

    return results.sort((a, b) => a.daysUntilAction - b.daysUntilAction);
  }
}
