import { createChildLogger } from '../logger';
import { storage } from "../storage";
import type { BadgeTemplate, Attendee } from "@shared/schema";

const logger = createChildLogger('BadgeResolver');

export interface TemplateResolutionResult {
  template: BadgeTemplate | null;
  resolutionPath: 'event_override' | 'customer_default' | 'any_template' | 'none';
  participantType: string;
}

export class BadgeTemplateResolver {
  async resolveTemplateForAttendee(
    attendee: Attendee,
    eventId: string
  ): Promise<TemplateResolutionResult> {
    const participantType = attendee.participantType || 'General';
    
    // Get event to find customer ID
    const event = await storage.getEvent(eventId);
    if (!event) {
      return {
        template: null,
        resolutionPath: 'none',
        participantType,
      };
    }

    // Step 1: Check for event-level override for this participant type
    const eventOverride = await storage.getEventBadgeTemplateOverrideByType(eventId, participantType);
    if (eventOverride) {
      const template = await storage.getBadgeTemplate(eventOverride.badgeTemplateId);
      if (template) {
        logger.info(`Resolved template via event override: ${template.name} for type ${participantType}`);
        return {
          template,
          resolutionPath: 'event_override',
          participantType,
        };
      }
    }

    // Step 2: Check for customer-level default template for this participant type
    const customerTemplates = await storage.getBadgeTemplates(event.customerId);
    const matchingTemplate = customerTemplates.find((t: BadgeTemplate) => 
      t.participantType?.toLowerCase() === participantType.toLowerCase()
    );
    
    if (matchingTemplate) {
      logger.info(`Resolved template via customer default: ${matchingTemplate.name} for type ${participantType}`);
      return {
        template: matchingTemplate,
        resolutionPath: 'customer_default',
        participantType,
      };
    }

    // Step 3: Fall back to any template (prefer "General" type if available)
    const generalTemplate = customerTemplates.find((t: BadgeTemplate) => 
      t.participantType?.toLowerCase() === 'general'
    );
    
    if (generalTemplate) {
      logger.info(`Resolved template via General fallback: ${generalTemplate.name}`);
      return {
        template: generalTemplate,
        resolutionPath: 'any_template',
        participantType,
      };
    }

    // Last resort: any template
    const anyTemplate = customerTemplates.length > 0 ? customerTemplates[0] : null;
    if (anyTemplate) {
      logger.info(`Resolved template via any available: ${anyTemplate.name}`);
      return {
        template: anyTemplate,
        resolutionPath: 'any_template',
        participantType,
      };
    }

    logger.info(`No template found for attendee ${attendee.id}, type ${participantType}`);
    return {
      template: null,
      resolutionPath: 'none',
      participantType,
    };
  }

  async resolveTemplateForParticipantType(
    eventId: string,
    participantType: string
  ): Promise<TemplateResolutionResult> {
    // Get event to find customer ID
    const event = await storage.getEvent(eventId);
    if (!event) {
      return {
        template: null,
        resolutionPath: 'none',
        participantType,
      };
    }

    // Step 1: Check for event-level override for this participant type
    const eventOverride = await storage.getEventBadgeTemplateOverrideByType(eventId, participantType);
    if (eventOverride) {
      const template = await storage.getBadgeTemplate(eventOverride.badgeTemplateId);
      if (template) {
        return {
          template,
          resolutionPath: 'event_override',
          participantType,
        };
      }
    }

    // Step 2: Check for customer-level default template for this participant type
    const customerTemplates = await storage.getBadgeTemplates(event.customerId);
    const matchingTemplate = customerTemplates.find((t: BadgeTemplate) => 
      t.participantType?.toLowerCase() === participantType.toLowerCase()
    );
    
    if (matchingTemplate) {
      return {
        template: matchingTemplate,
        resolutionPath: 'customer_default',
        participantType,
      };
    }

    // Step 3: Fall back to any template
    const generalTemplate = customerTemplates.find((t: BadgeTemplate) => 
      t.participantType?.toLowerCase() === 'general'
    );
    
    if (generalTemplate) {
      return {
        template: generalTemplate,
        resolutionPath: 'any_template',
        participantType,
      };
    }

    const anyTemplate = customerTemplates.length > 0 ? customerTemplates[0] : null;
    if (anyTemplate) {
      return {
        template: anyTemplate,
        resolutionPath: 'any_template',
        participantType,
      };
    }

    return {
      template: null,
      resolutionPath: 'none',
      participantType,
    };
  }

  async getAllMappingsForEvent(eventId: string): Promise<Map<string, BadgeTemplate | null>> {
    const event = await storage.getEvent(eventId);
    if (!event) {
      return new Map();
    }

    // Get all event overrides
    const overrides = await storage.getEventBadgeTemplateOverrides(eventId);
    
    // Get all customer templates
    const customerTemplates = await storage.getBadgeTemplates(event.customerId);
    
    // Build a map of participant type -> template
    const participantTypes: string[] = [];
    
    // Collect all known participant types
    overrides.forEach(o => {
      if (!participantTypes.includes(o.participantType)) {
        participantTypes.push(o.participantType);
      }
    });
    customerTemplates.forEach((t: BadgeTemplate) => {
      if (t.participantType && !participantTypes.includes(t.participantType)) {
        participantTypes.push(t.participantType);
      }
    });

    // Standard types that should always be included
    const standardTypes = ['General', 'VIP', 'Speaker', 'Sponsor', 'Staff', 'Press', 'Media', 'Exhibitor'];
    standardTypes.forEach(type => {
      if (!participantTypes.includes(type)) {
        participantTypes.push(type);
      }
    });

    // Resolve template for each participant type
    const mappings = new Map<string, BadgeTemplate | null>();
    
    for (const type of participantTypes) {
      const result = await this.resolveTemplateForParticipantType(eventId, type);
      mappings.set(type, result.template);
    }

    return mappings;
  }
}

export const badgeTemplateResolver = new BadgeTemplateResolver();
