FROM php:8.2-apache

# Install PostgreSQL dependencies only
RUN apt-get update && apt-get install -y \
    libpq-dev \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install PostgreSQL PHP extensions with explicit configuration
RUN docker-php-ext-configure pgsql -with-pgsql=/usr/local/pgsql \
    && docker-php-ext-install pdo pdo_pgsql pgsql

# Verify PostgreSQL extensions are loaded (will fail build if not working)
RUN php -m | grep pdo_pgsql || (echo "ERROR: pdo_pgsql extension not loaded" && exit 1)
RUN php -m | grep pgsql || (echo "ERROR: pgsql extension not loaded" && exit 1)

# Test PDO PostgreSQL driver availability
RUN php -r "if (!in_array('pgsql', PDO::getAvailableDrivers())) { echo 'ERROR: PostgreSQL PDO driver not available'; exit(1); } else { echo 'SUCCESS: PostgreSQL PDO driver available'; }"

# Enable Apache modules
RUN a2enmod rewrite headers expires

# Set ServerName to suppress warnings
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

# Set working directory
WORKDIR /var/www/html

# Copy application files
COPY . .

# Set permissions
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html

# Expose port
EXPOSE 80

# Start Apache
CMD ["apache2-foreground"]