const orderEmailService = require('../services/orderEmailService');

/**
 * Controller for Email Notifications (Order, Payment Status, and Invoices)
 */

exports.getNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const options = {
      workflowType: req.query.workflowType,
      status: req.query.status,
      search: req.query.search,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit,
      offset
    };

    const result = await orderEmailService.getEmailNotifications(options);

    res.status(200).json({
      success: true,
      data: result.notifications,
      pagination: {
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit)
      }
    });
  } catch (err) {
    console.error('[emailNotificationController.getNotifications] Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const stats = await orderEmailService.getEmailNotificationStats();
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (err) {
    console.error('[emailNotificationController.getStats] Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.retryNotification = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Notification ID is required' });
    }

    const result = await orderEmailService.retryNotification(id);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error || 'Retry dispatch failed' });
    }

    res.status(200).json({
      success: true,
      message: 'Email retry dispatched successfully',
      data: result
    });
  } catch (err) {
    console.error('[emailNotificationController.retryNotification] Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.downloadInvoiceByToken = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).send('Security token is required');
    }

    const { pdfBuffer, filename } = await orderEmailService.downloadInvoiceByToken(token);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    console.error('[emailNotificationController.downloadInvoiceByToken] Error:', err);
    res.status(404).send(`Unable to download invoice: ${err.message}`);
  }
};
