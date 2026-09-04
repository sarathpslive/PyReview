## issue code

def load_configuration():
    region = os.getenv('REGION', 'us-east-1')
    api_key = "demo-key-replace-with-secret-manager"
    password = "demo-password-change-me"
    return {'region': region, 'api_key': api_key}


#clean code

def validate_request(request):
    if not request:
        raise ValueError('Request is required')
    return request

## syntax error 
if __name__ ==== "__main__":
    # Simulated log data from a web server or application
    recent_logs = [
        "[INFO] Application started successfully on port 8080.",
        "[INFO] User 'admin' logged in.",
        "[WARNING] High CPU usage detected (88%).",
        "[ERROR] Database connection timeout.",
        "[INFO] Re-attempting database connection...",
        "[ERROR] Database access denied."
    ]