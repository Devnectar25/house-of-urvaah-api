-- 008_email_notifications_schema.sql
-- House of Urvaah: Separate Order Confirmation, Payment Status, and Invoice Email Workflows

CREATE TABLE IF NOT EXISTS public.email_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_type VARCHAR(50) NOT NULL, -- 'ORDER_CONFIRMATION', 'PAYMENT_STATUS', 'INVOICE'
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    order_number VARCHAR(100) NOT NULL,
    payment_id VARCHAR(255),
    invoice_number VARCHAR(100),
    customer_id VARCHAR(255),
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255),
    subject VARCHAR(500) NOT NULL,
    event_type VARCHAR(100) NOT NULL, -- 'ORDER_CREATED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'PAYMENT_REFUNDED', 'INVOICE_ISSUED'
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    provider VARCHAR(50) DEFAULT 'brevo',
    provider_message_id VARCHAR(255),
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    has_attachment BOOLEAN DEFAULT false,
    attachment_name VARCHAR(255),
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    secure_token VARCHAR(255) UNIQUE,
    metadata JSONB DEFAULT '{}'::jsonb,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_notifications_workflow ON public.email_notifications(workflow_type);
CREATE INDEX IF NOT EXISTS idx_email_notifications_order_id ON public.email_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_email_notifications_order_number ON public.email_notifications(order_number);
CREATE INDEX IF NOT EXISTS idx_email_notifications_recipient ON public.email_notifications(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_notifications_status ON public.email_notifications(status);
CREATE INDEX IF NOT EXISTS idx_email_notifications_created_at ON public.email_notifications(created_at DESC);
